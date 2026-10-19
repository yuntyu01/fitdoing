package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const kakaoIssuer = "https://kauth.kakao.com"
const kakaoUnlinked = "https://schemas.openid.net/secevent/oauth/event-type/user-unlinked"
const kakaoRevoked = "https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked"

// KakaoEventVerifier validates SETs using Kakao's public keys. No Admin key is needed.
type KakaoEventVerifier struct {
	AppID, Audience string
	Keys            *IDTokenVerifier
	Now             func() time.Time
}
type KakaoEvent struct {
	ID, Subject       string
	OccurredAt        int64
	Unlinked, Revoked bool
}
type eventValidationError string

func (e eventValidationError) Error() string { return string(e) }

func NewKakaoEventVerifier(appID, audience string) *KakaoEventVerifier {
	return &KakaoEventVerifier{AppID: appID, Audience: audience, Keys: &IDTokenVerifier{JWKSURL: kakaoIssuer + "/.well-known/jwks.json", Client: &http.Client{Timeout: 1500 * time.Millisecond}}}
}

func (v *KakaoEventVerifier) Verify(ctx context.Context, token string) (KakaoEvent, error) {
	bad := func(code string) (KakaoEvent, error) { return KakaoEvent{}, eventValidationError(code) }
	if v == nil || v.AppID == "" || v.Audience == "" || v.Keys == nil {
		return KakaoEvent{}, ErrNotConfigured
	}
	p := strings.Split(token, ".")
	if len(p) != 3 {
		return bad("invalid_request")
	}
	var h struct{ Alg, Typ, Kid string }
	hb, err := b64.DecodeString(p[0])
	if err != nil || json.Unmarshal(hb, &h) != nil || h.Alg != "RS256" || h.Typ != "secevent+jwt" || h.Kid == "" {
		return bad("invalid_request")
	}
	key, err := v.Keys.key(ctx, h.Kid)
	if errors.Is(err, ErrUnknownKeyID) {
		return bad("invalid_key")
	}
	if err != nil {
		return KakaoEvent{}, err
	}
	sig, err := b64.DecodeString(p[2])
	sum := sha256.Sum256([]byte(p[0] + "." + p[1]))
	if err != nil || rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig) != nil {
		return bad("invalid_key")
	}
	var c struct {
		Iss, Sub, Jti string
		Aud           json.RawMessage
		AppID         json.RawMessage `json:"app_id"`
		Iat, Toe      int64
		Events        map[string]json.RawMessage
	}
	pb, err := b64.DecodeString(p[1])
	if err != nil || json.Unmarshal(pb, &c) != nil || c.Jti == "" || len(c.Jti) > 256 {
		return bad("invalid_request")
	}
	if c.Iss != kakaoIssuer {
		return bad("invalid_issuer")
	}
	var audience string
	var audiences []string
	if json.Unmarshal(c.Aud, &audience) == nil {
		audiences = []string{audience}
	} else {
		_ = json.Unmarshal(c.Aud, &audiences)
	}
	matchedAudience := false
	for _, a := range audiences {
		matchedAudience = matchedAudience || a == v.Audience
	}
	if !matchedAudience {
		return bad("invalid_audience")
	}
	var appID string
	if len(c.AppID) > 0 && json.Unmarshal(c.AppID, &appID) != nil {
		var num json.Number
		if json.Unmarshal(c.AppID, &num) != nil {
			return bad("invalid_request")
		}
		appID = num.String()
	}
	if len(c.AppID) > 0 && appID != v.AppID {
		return bad("invalid_audience")
	}
	now := time.Now()
	if v.Now != nil {
		now = v.Now()
	}
	if c.Toe == 0 {
		c.Toe = c.Iat
	}
	if c.Iat <= 0 || c.Toe < 0 || c.Iat > now.Unix()+120 || c.Toe > now.Unix()+120 || c.Iat < now.Add(-24*time.Hour).Unix() || c.Toe < now.Add(-24*time.Hour).Unix() {
		return bad("invalid_request")
	}
	out := KakaoEvent{ID: c.Jti, Subject: c.Sub, OccurredAt: c.Toe}
	for schema, raw := range c.Events {
		if schema != kakaoUnlinked && schema != kakaoRevoked {
			continue
		}
		var e struct {
			Subject struct {
				Sub, Iss string
				Type     string `json:"subject_type"`
			}
		}
		if json.Unmarshal(raw, &e) != nil || e.Subject.Type != "iss-sub" || e.Subject.Iss != kakaoIssuer {
			return bad("invalid_request")
		}
		if out.Subject == "" {
			out.Subject = e.Subject.Sub
		}
		if e.Subject.Sub != out.Subject {
			return bad("invalid_request")
		}
		if n, err := strconv.ParseInt(out.Subject, 10, 64); err != nil || n <= 0 {
			return bad("invalid_request")
		}
		out.Unlinked = out.Unlinked || schema == kakaoUnlinked
		out.Revoked = out.Revoked || schema == kakaoRevoked
	}
	return out, nil
}

// Receipts contain no member ID or JWT. Pending deletion jobs survive restarts and user deletion.
type KakaoEventReceipt struct {
	Digest    string    `gorm:"primaryKey;size:64"`
	CreatedAt time.Time `gorm:"not null;index"`
}
type KakaoDeletionJob struct {
	UserID        string    `gorm:"primaryKey;size:36"`
	Attempts      int       `gorm:"not null;default:0"`
	NextAttemptAt time.Time `gorm:"not null;index"`
}

func (s *Service) acceptKakaoEvent(ctx context.Context, e KakaoEvent) error {
	hash := sha256.Sum256([]byte(e.ID))
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		receipt := KakaoEventReceipt{Digest: hex.EncodeToString(hash[:]), CreatedAt: s.now().UTC()}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&receipt)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		if !e.Unlinked && !e.Revoked {
			return nil
		}
		var ids []Identity
		if err := tx.Where("provider = ? AND subject = ?", string(Kakao), e.Subject).Limit(1).Find(&ids).Error; err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		identity := ids[0]
		// A delayed event for a deleted account must not erase a subsequently recreated account.
		if identity.CreatedAt.Unix() > e.OccurredAt {
			return nil
		}
		var users []platform.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", identity.UserID).Limit(1).Find(&users).Error; err != nil {
			return err
		}
		if len(users) == 0 {
			return nil
		}
		if err := tx.Model(&platform.User{}).Where("id = ?", identity.UserID).Update("auth_version", gorm.Expr("auth_version + 1")).Error; err != nil {
			return err
		}
		if !e.Unlinked {
			return nil
		}
		var others int64
		if err := tx.Model(&Identity{}).Where("user_id = ? AND id <> ?", identity.UserID, identity.ID).Count(&others).Error; err != nil {
			return err
		}
		if others > 0 {
			return tx.Delete(&Identity{}, "id = ?", identity.ID).Error
		}
		if err := tx.Model(&platform.User{}).Where("id = ?", identity.UserID).Update("auth_blocked", true).Error; err != nil {
			return err
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&KakaoDeletionJob{UserID: identity.UserID, NextAttemptAt: s.now().UTC()}).Error
	})
}

func registerKakaoEvents(mux *http.ServeMux, s *Service) {
	mux.HandleFunc("POST /api/auth/kakao/events", func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, code string) {
			platform.JSON(w, status, map[string]string{"err": code, "description": "Account event validation or persistence failed"})
		}
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/secevent+jwt" {
			fail(400, "invalid_request")
			return
		}
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
		if err != nil {
			fail(400, "invalid_request")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2500*time.Millisecond)
		defer cancel()
		event, err := s.KakaoEvents.Verify(ctx, string(raw))
		if err != nil {
			var invalid eventValidationError
			if errors.As(err, &invalid) {
				fail(400, string(invalid))
			} else {
				fail(503, "temporarily_unavailable")
			}
			return
		}
		if err := s.acceptKakaoEvent(ctx, event); err != nil {
			fail(503, "temporarily_unavailable")
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})
}

func (s *Service) ProcessKakaoDeletions(ctx context.Context) error {
	var jobs []KakaoDeletionJob
	if err := s.db.WithContext(ctx).Where("next_attempt_at <= ?", s.now().UTC()).Order("next_attempt_at").Limit(20).Find(&jobs).Error; err != nil {
		return err
	}
	for _, job := range jobs {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := s.purgeAccount(job.UserID); err != nil {
			delay := time.Minute * time.Duration(1<<min(job.Attempts, 6))
			if delay > time.Hour {
				delay = time.Hour
			}
			if err := s.db.WithContext(ctx).Model(&KakaoDeletionJob{}).Where("user_id = ?", job.UserID).Updates(map[string]any{"attempts": gorm.Expr("attempts + 1"), "next_attempt_at": s.now().Add(delay).UTC()}).Error; err != nil {
				return err
			}
			slog.Warn("kakao account deletion queued for retry")
			continue
		}
		if err := s.db.WithContext(ctx).Delete(&KakaoDeletionJob{}, "user_id = ?", job.UserID).Error; err != nil {
			return err
		}
	}
	return s.db.WithContext(ctx).Where("created_at < ?", s.now().Add(-30*24*time.Hour).UTC()).Delete(&KakaoEventReceipt{}).Error
}

func (s *Service) RunKakaoDeletions(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		if err := s.ProcessKakaoDeletions(ctx); err != nil && ctx.Err() == nil {
			slog.Error("kakao deletion worker requires retry")
		}
		if s.CleanupPhotos != nil {
			if err := s.CleanupPhotos(ctx); err != nil && ctx.Err() == nil {
				slog.Error("photo cleanup worker requires retry")
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
