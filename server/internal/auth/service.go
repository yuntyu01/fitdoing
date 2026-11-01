// Package auth is the login: the phone signs in with Kakao, Google or Apple, sends the provider's token here,
// and gets a login token of this server back. Every user is one row in users; the provider accounts that can
// log into it are rows in identities.
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Identity is one provider account that logs into a user (table identities).
type Identity struct {
	ID        uint      `gorm:"primaryKey;autoIncrement"`
	UserID    string    `gorm:"column:user_id;size:36;not null;index"`
	Provider  string    `gorm:"column:provider;size:8;not null;uniqueIndex:ux_identity,priority:1;check:ck_identities_provider,provider IN ('kakao','google','apple')"`
	Subject   string    `gorm:"column:subject;size:255;not null;uniqueIndex:ux_identity,priority:2"`
	CreatedAt time.Time `gorm:"column:created_at;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Identity) TableName() string { return "identities" }

// Models lists the tables of this package for AutoMigrate (users first).
func Models() []any {
	return []any{&platform.User{}, &Identity{}, &RetiredDevice{}, &KakaoEventReceipt{}, &KakaoDeletionJob{}}
}

// RetiredDevice stores only a high-entropy device-token digest, without an account foreign key.
// It must survive account deletion so an obsolete anonymous token cannot recreate that account.
type RetiredDevice struct {
	Digest    string    `gorm:"primaryKey;size:64"`
	CreatedAt time.Time `gorm:"not null"`
}

// TokenTTL is how long a login token works; after that the phone logs in again.
const TokenTTL = 90 * 24 * time.Hour

type Service struct {
	db        *gorm.DB
	secret    []byte
	verifiers map[Provider]Verifier
	now       func() time.Time
	// BeforeDelete runs before an account is deleted, for data outside the database (backed-up photo objects).
	BeforeDelete  []func(userID string) error
	KakaoEvents   *KakaoEventVerifier
	CleanupPhotos func(context.Context) error
}

func NewService(db *gorm.DB, secret string, verifiers map[Provider]Verifier, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{db: db, secret: []byte(secret), verifiers: verifiers, now: now}
}

// Providers exposes availability only, never app keys, client IDs or secrets.
func (s *Service) Providers() map[string]bool {
	available := map[string]bool{"google": false, "kakao": false}
	for _, p := range []Provider{Google, Kakao} {
		if v, ok := s.verifiers[p].(interface{ Configured() bool }); ok {
			available[string(p)] = v.Configured()
		}
	}
	return available
}

type LoginResult struct {
	Token  string `json:"token"`
	UserID string `json:"userId"`
	IsNew  bool   `json:"isNew"`
}

// Login verifies the provider token and returns this server's login token, creating the user on first login.
func (s *Service) Login(ctx context.Context, p Provider, token string) (LoginResult, error) {
	return s.LoginWithDevice(ctx, p, token, "")
}

// LoginWithDevice upgrades only the caller's existing anonymous installation after provider verification.
// A different existing provider account is never merged into that installation automatically.
func (s *Service) LoginWithDevice(ctx context.Context, p Provider, token, deviceToken string) (LoginResult, error) {
	v, ok := s.verifiers[p]
	if !ok || token == "" {
		return LoginResult{}, platform.Invalid("provider", "kakao, google, apple 중 하나와 token이 필요해요")
	}
	subject, err := v.Verify(ctx, token)
	switch {
	case errors.Is(err, ErrNotConfigured):
		return LoginResult{}, &platform.Error{Status: http.StatusServiceUnavailable, Code: "PROVIDER_NOT_CONFIGURED", Message: "이 로그인은 아직 서버에 설정되지 않았어요"}
	case errors.Is(err, ErrInvalidToken):
		return LoginResult{}, &platform.Error{Status: http.StatusUnauthorized, Code: "AUTH_FAILED", Message: "로그인을 확인하지 못했어요"}
	case err != nil:
		return LoginResult{}, &platform.Error{Status: http.StatusBadGateway, Code: "PROVIDER_UNAVAILABLE", Message: "로그인 서비스에 연결하지 못했어요"}
	}
	userID, claimed, err := s.claimDevice(string(p), subject, deviceToken)
	if err != nil {
		return LoginResult{}, err
	}
	isNew := false
	if !claimed {
		userID, isNew, err = s.userFor(string(p), subject)
	}
	if err != nil {
		return LoginResult{}, err
	}
	if !claimed && !isNew && strings.HasPrefix(deviceToken, "device-") && len(deviceToken) >= 16 {
		return LoginResult{}, &platform.Error{Status: http.StatusConflict, Code: "ACCOUNT_LINK_CONFLICT", Message: "기존 기록을 보호하기 위해 다른 계정과 자동으로 합치지 않았어요"}
	}
	var users []platform.User
	if err := s.db.Where("id = ?", userID).Limit(1).Find(&users).Error; err != nil {
		return LoginResult{}, err
	}
	if len(users) != 1 || users[0].AuthBlocked {
		return LoginResult{}, &platform.Error{Status: http.StatusUnauthorized, Code: "ACCOUNT_DELETION_PENDING", Message: "계정 삭제를 처리하고 있어요"}
	}
	return LoginResult{Token: issue(s.secret, userID, s.now(), TokenTTL, users[0].AuthVersion), UserID: userID, IsNew: isNew}, nil
}

func (s *Service) claimDevice(provider, subject, token string) (string, bool, error) {
	// Never claim the shared historical "dev" user. Its data has no provable single owner.
	if !strings.HasPrefix(token, "device-") || len(token) < 16 || len(token) > 256 || strings.Contains(token, ".") {
		return "", false, nil
	}
	sum := sha256.Sum256([]byte(token))
	uid := "dev-" + hex.EncodeToString(sum[:12])
	claimed := false
	conflict := &platform.Error{Status: http.StatusConflict, Code: "ACCOUNT_LINK_CONFLICT", Message: "기존 기록을 보호하기 위해 다른 계정과 자동으로 합치지 않았어요"}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var users []platform.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", uid).Limit(1).Find(&users).Error; err != nil {
			return err
		}
		if len(users) == 0 {
			return nil // offline-only installation: normal login, then upload its local records
		}
		var existing []Identity
		if err := tx.Where("provider = ? AND subject = ?", provider, subject).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if len(existing) > 0 {
			if existing[0].UserID != uid {
				return conflict
			}
			claimed = true
			return nil
		}
		var count int64
		if err := tx.Model(&Identity{}).Where("user_id = ?", uid).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return conflict // an already upgraded token cannot link another provider
		}
		if err := tx.Omit("User").Create(&Identity{UserID: uid, Provider: provider, Subject: subject, CreatedAt: s.now().UTC()}).Error; err != nil {
			return err
		}
		if err := tx.Create(&RetiredDevice{Digest: hex.EncodeToString(sum[:]), CreatedAt: s.now().UTC()}).Error; err != nil {
			return err
		}
		claimed = true
		return nil
	})
	return uid, claimed, err
}

func (s *Service) userFor(provider, subject string) (string, bool, error) {
	find := func(db *gorm.DB) (string, error) {
		var ids []Identity // Find, not First: a missing row is normal here and First would log it as an error
		if err := db.Where("provider = ? AND subject = ?", provider, subject).Limit(1).Find(&ids).Error; err != nil {
			return "", err
		}
		if len(ids) == 0 {
			return "", gorm.ErrRecordNotFound
		}
		return ids[0].UserID, nil
	}
	if uid, err := find(s.db); err == nil {
		return uid, false, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, err
	}
	uid := uuid.NewString()
	err := s.db.Transaction(func(tx *gorm.DB) error {
		now := s.now().UTC()
		if err := tx.Create(&platform.User{ID: uid, CreatedAt: now}).Error; err != nil {
			return err
		}
		return tx.Omit("User").Create(&Identity{UserID: uid, Provider: provider, Subject: subject, CreatedAt: now}).Error
	})
	if err != nil { // two first logins at once: the other one won, use its user
		if other, ferr := find(s.db); ferr == nil {
			return other, false, nil
		}
		return "", false, err
	}
	return uid, true, nil
}

// Resolve turns a login token into the user id, refusing forged, expired and deleted-account tokens.
func (s *Service) Resolve(token string) (string, error) {
	c, err := parseClaims(s.secret, token, s.now())
	if err != nil {
		return "", err
	}
	var users []platform.User
	if err := s.db.Where("id = ?", c.Sub).Limit(1).Find(&users).Error; err != nil {
		return "", err
	}
	if len(users) != 1 || users[0].AuthBlocked || users[0].AuthVersion != c.Version {
		return "", ErrInvalidToken
	}
	return c.Sub, nil
}

// DeleteAccount removes the user; every table references users with ON DELETE CASCADE.
func (s *Service) DeleteAccount(userID string) error {
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&platform.User{}).Where("id = ?", userID).Updates(map[string]any{"auth_blocked": true, "auth_version": gorm.Expr("auth_version + 1")}).Error; err != nil {
			return err
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&KakaoDeletionJob{UserID: userID, NextAttemptAt: s.now().UTC()}).Error
	}); err != nil {
		return err
	}
	if err := s.purgeAccount(userID); err != nil {
		slog.Warn("account deletion retained for storage retry")
		return nil // access is revoked and a durable cleanup request has been accepted
	}
	return s.db.Delete(&KakaoDeletionJob{}, "user_id = ?", userID).Error
}

func (s *Service) purgeAccount(userID string) error {
	for _, f := range s.BeforeDelete {
		if err := f(userID); err != nil {
			return err
		}
	}
	return s.db.Delete(&platform.User{}, "id = ?", userID).Error
}

func (s *Service) retireDeletedDevice(userID, token string) error {
	if len(token) < 16 || strings.Contains(token, ".") {
		return nil
	}
	sum := sha256.Sum256([]byte(token))
	if userID != "dev-"+hex.EncodeToString(sum[:12]) {
		return nil
	}
	return s.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&RetiredDevice{Digest: hex.EncodeToString(sum[:]), CreatedAt: s.now().UTC()}).Error
}

// DevUserID is the user of the plain "dev" token in AUTH_DISABLED mode (curl, old dev builds).
const DevUserID = "dev-user"

// DevResolve is the login of AUTH_DISABLED mode (development and closed testing without login): every token is
// its own user, created on first use. The app sends a random per-install token, so each tester gets their own data
// (and friends work between testers) without any login. The token "dev" is the shared dev user.
func (s *Service) DevResolve(token string) (string, error) {
	sum := sha256.Sum256([]byte(token))
	var retired int64
	if err := s.db.Model(&RetiredDevice{}).Where("digest = ?", hex.EncodeToString(sum[:])).Count(&retired).Error; err != nil {
		return "", err
	}
	if retired != 0 {
		return "", ErrInvalidToken
	}
	id := DevUserID
	if token != "dev" {
		if len(token) < 16 {
			return "", ErrInvalidToken // a device token is long and random; refuse guessable ones
		}
		id = "dev-" + hex.EncodeToString(sum[:12])
	}
	var linked int64
	if err := s.db.Model(&Identity{}).Where("user_id = ?", id).Count(&linked).Error; err != nil {
		return "", err
	}
	if linked != 0 {
		return "", ErrInvalidToken // claimed installations must use their signed session
	}
	u := platform.User{ID: id, CreatedAt: s.now()}
	if err := s.db.Where("id = ?", id).FirstOrCreate(&u).Error; err != nil {
		return "", err
	}
	if u.AuthBlocked {
		return "", ErrInvalidToken
	}
	return id, nil
}

// ResolveTransition keeps existing test installations working while signed provider sessions use real accounts.
// An invalid/expired signed token must never become a new anonymous installation.
func (s *Service) ResolveTransition(token string) (string, error) {
	if strings.Contains(token, ".") {
		return s.Resolve(token)
	}
	return s.DevResolve(token)
}
