// Package auth is the login: the phone signs in with Kakao, Google or Apple, sends the provider's token here,
// and gets a login token of this server back. Every user is one row in users; the provider accounts that can
// log into it are rows in identities.
package auth

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
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
func Models() []any { return []any{&platform.User{}, &Identity{}} }

// TokenTTL is how long a login token works; after that the phone logs in again.
const TokenTTL = 90 * 24 * time.Hour

type Service struct {
	db        *gorm.DB
	secret    []byte
	verifiers map[Provider]Verifier
	now       func() time.Time
	// BeforeDelete runs before an account is deleted, for data outside the database (backed-up photo objects).
	BeforeDelete []func(userID string) error
}

func NewService(db *gorm.DB, secret string, verifiers map[Provider]Verifier, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{db: db, secret: []byte(secret), verifiers: verifiers, now: now}
}

type LoginResult struct {
	Token  string `json:"token"`
	UserID string `json:"userId"`
	IsNew  bool   `json:"isNew"`
}

// Login verifies the provider token and returns this server's login token, creating the user on first login.
func (s *Service) Login(ctx context.Context, p Provider, token string) (LoginResult, error) {
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
	userID, isNew, err := s.userFor(string(p), subject)
	if err != nil {
		return LoginResult{}, err
	}
	return LoginResult{Token: issue(s.secret, userID, s.now(), TokenTTL), UserID: userID, IsNew: isNew}, nil
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
	uid, err := parse(s.secret, token, s.now())
	if err != nil {
		return "", err
	}
	var n int64
	if err := s.db.Model(&platform.User{}).Where("id = ?", uid).Count(&n).Error; err != nil {
		return "", err
	}
	if n == 0 {
		return "", ErrInvalidToken
	}
	return uid, nil
}

// DeleteAccount removes the user; every table references users with ON DELETE CASCADE.
func (s *Service) DeleteAccount(userID string) error {
	for _, f := range s.BeforeDelete {
		if err := f(userID); err != nil {
			return err
		}
	}
	return s.db.Delete(&platform.User{}, "id = ?", userID).Error
}

// DevUserID is the one user of AUTH_DISABLED mode.
const DevUserID = "dev-user"

// DevResolve accepts any token as the fixed dev user (created on first use). Development only: AUTH_DISABLED=1.
func (s *Service) DevResolve(string) (string, error) {
	u := platform.User{ID: DevUserID, CreatedAt: s.now()}
	if err := s.db.Where("id = ?", DevUserID).FirstOrCreate(&u).Error; err != nil {
		return "", err
	}
	return DevUserID, nil
}
