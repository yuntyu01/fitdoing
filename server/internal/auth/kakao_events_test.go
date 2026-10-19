package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

type eventProvider struct{}

func (eventProvider) Verify(_ context.Context, token string) (string, error) {
	if !strings.HasPrefix(token, "test:") {
		return "", ErrInvalidToken
	}
	return strings.TrimPrefix(token, "test:"), nil
}

type eventOwnedRow struct {
	ID     uint `gorm:"primaryKey"`
	UserID string
	Value  string
	User   *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func eventService(t *testing.T) (*Service, *time.Time) {
	t.Helper()
	db, err := platform.OpenDB("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(append(Models(), &eventOwnedRow{})...); err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_800_000_000, 0).UTC()
	svc := NewService(db, string(secret), map[Provider]Verifier{Kakao: eventProvider{}, Google: eventProvider{}}, func() time.Time { return now })
	return svc, &now
}

func signedSET(t *testing.T, key *rsa.PrivateKey, c map[string]any, typ string) string {
	t.Helper()
	h, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": typ, "kid": "set-key"})
	p, _ := json.Marshal(c)
	in := b64.EncodeToString(h) + "." + b64.EncodeToString(p)
	sum := sha256.Sum256([]byte(in))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return in + "." + b64.EncodeToString(sig)
}
func setClaims(now time.Time, schema, sub, jti string) map[string]any {
	return map[string]any{"iss": kakaoIssuer, "aud": "own-rest-audience", "app_id": "1604237", "sub": sub, "iat": now.Unix(), "toe": now.Unix(), "jti": jti, "events": map[string]any{schema: map[string]any{"subject": map[string]string{"subject_type": "iss-sub", "iss": kakaoIssuer, "sub": sub}}}}
}
func eventHTTP(s *Service, token string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	Register(mux, s)
	req := httptest.NewRequest("POST", "/api/auth/kakao/events", strings.NewReader(token))
	req.Header.Set("Content-Type", "application/secevent+jwt")
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)
	return res
}
func configureTestEvents(t *testing.T, s *Service, now *time.Time) *rsa.PrivateKey {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	hits := 0
	keys := jwksServer(t, key, "set-key", &hits)
	s.KakaoEvents = &KakaoEventVerifier{AppID: "1604237", Audience: "own-rest-audience", Now: func() time.Time { return *now }, Keys: &IDTokenVerifier{JWKSURL: keys.URL, Now: func() time.Time { return *now }}}
	return key
}

func TestKakaoSETValidationAndNoSideEffects(t *testing.T) {
	s, now := eventService(t)
	key := configureTestEvents(t, s, now)
	for _, tc := range []struct {
		name, field string
		value       any
	}{
		{"wrong issuer", "iss", "https://attacker.invalid"}, {"wrong audience", "aud", "another-app-key"}, {"wrong app", "app_id", "1604236"}, {"expired", "iat", now.Add(-25 * time.Hour).Unix()}, {"future", "toe", now.Add(time.Hour).Unix()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := setClaims(*now, kakaoUnlinked, "123", "invalid-"+tc.name)
			c[tc.field] = tc.value
			res := eventHTTP(s, signedSET(t, key, c, "secevent+jwt"))
			if res.Code != 400 {
				t.Fatalf("status=%d", res.Code)
			}
		})
	}
	token := signedSET(t, key, setClaims(*now, kakaoUnlinked, "123", "bad-signature"), "secevent+jwt")
	if res := eventHTTP(s, token+"x"); res.Code != 400 {
		t.Fatalf("bad signature status=%d", res.Code)
	}
	if res := eventHTTP(s, signedSET(t, key, setClaims(*now, kakaoUnlinked, "123", "wrong-typ"), "JWT")); res.Code != 400 {
		t.Fatalf("cross-JWT status=%d", res.Code)
	}
	var receipts int64
	s.db.Model(&KakaoEventReceipt{}).Count(&receipts)
	if receipts != 0 {
		t.Fatal("invalid SET changed storage")
	}
	c := setClaims(*now, kakaoUnlinked, "123", "unknown-user")
	c["app_id"] = 1604237
	if res := eventHTTP(s, signedSET(t, key, c, "secevent+jwt")); res.Code != 202 {
		t.Fatalf("valid unknown member status=%d body=%s", res.Code, res.Body.String())
	}
	var users int64
	s.db.Model(&platform.User{}).Count(&users)
	if users != 0 {
		t.Fatal("webhook created an account")
	}
	c = setClaims(*now, kakaoRevoked, "123", "optional-standard-metadata")
	delete(c, "toe")
	delete(c, "app_id")
	c["aud"] = []string{"own-rest-audience"}
	if res := eventHTTP(s, signedSET(t, key, c, "secevent+jwt")); res.Code != 202 {
		t.Fatalf("standard SET without optional metadata status=%d", res.Code)
	}
}

func TestKakaoSETRevokesSessionsWithoutDeletingAndDeduplicates(t *testing.T) {
	s, now := eventService(t)
	key := configureTestEvents(t, s, now)
	ctx := context.Background()
	login, err := s.Login(ctx, Kakao, "test:123")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.db.Create(&eventOwnedRow{UserID: login.UserID, Value: "isolated test record"}).Error; err != nil {
		t.Fatal(err)
	}
	*now = now.Add(time.Minute)
	token := signedSET(t, key, setClaims(*now, kakaoRevoked, "123", "revoke-1"), "secevent+jwt")
	if res := eventHTTP(s, token); res.Code != 202 {
		t.Fatalf("status=%d", res.Code)
	}
	if _, err := s.Resolve(login.Token); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("old service session accepted")
	}
	next, err := s.Login(ctx, Kakao, "test:123")
	if err != nil {
		t.Fatal(err)
	}
	if res := eventHTTP(s, token); res.Code != 202 {
		t.Fatal(res.Code)
	}
	if _, err := s.Resolve(next.Token); err != nil {
		t.Fatal("duplicate event revoked new session")
	}
	var rows, jobs int64
	s.db.Model(&eventOwnedRow{}).Count(&rows)
	s.db.Model(&KakaoDeletionJob{}).Count(&jobs)
	if rows != 1 || jobs != 0 {
		t.Fatal("revocation deleted records")
	}
}

func TestKakaoSETDeletionBlocksImmediatelyRetriesAndProtectsRecreatedAccount(t *testing.T) {
	s, now := eventService(t)
	key := configureTestEvents(t, s, now)
	ctx := context.Background()
	original, err := s.Login(ctx, Kakao, "test:123")
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.Login(ctx, Google, "test:123")
	if err != nil {
		t.Fatal(err)
	}
	for _, uid := range []string{original.UserID, other.UserID} {
		if err := s.db.Create(&eventOwnedRow{UserID: uid, Value: "isolated test record"}).Error; err != nil {
			t.Fatal(err)
		}
	}
	*now = now.Add(time.Minute)
	occurred := *now
	token := signedSET(t, key, setClaims(occurred, kakaoUnlinked, "123", "unlink-1"), "secevent+jwt")
	if res := eventHTTP(s, token); res.Code != 202 {
		t.Fatal(res.Code, res.Body.String())
	}
	if _, err := s.Resolve(original.Token); err == nil {
		t.Fatal("pending-deletion account accessible")
	}
	if _, err := s.Login(ctx, Kakao, "test:123"); err == nil {
		t.Fatal("pending-deletion account can log in")
	}
	s.BeforeDelete = []func(string) error{func(string) error { return errors.New("isolated storage unavailable") }}
	if err := s.ProcessKakaoDeletions(ctx); err != nil {
		t.Fatal(err)
	}
	var job KakaoDeletionJob
	if err := s.db.First(&job).Error; err != nil || job.Attempts != 1 {
		t.Fatal("failed deletion was not durably retried", err)
	}
	// Simulate a process restart with the same database and recovered object storage.
	restored := NewService(s.db, string(secret), map[Provider]Verifier{Kakao: eventProvider{}, Google: eventProvider{}}, func() time.Time { return *now })
	restored.BeforeDelete = []func(string) error{func(uid string) error {
		if uid != original.UserID {
			t.Fatal("wrong user's files selected")
		}
		return nil
	}}
	*now = now.Add(2 * time.Minute)
	if err := restored.ProcessKakaoDeletions(ctx); err != nil {
		t.Fatal(err)
	}
	var oldRows, jobs int64
	s.db.Model(&eventOwnedRow{}).Where("user_id = ?", original.UserID).Count(&oldRows)
	s.db.Model(&KakaoDeletionJob{}).Count(&jobs)
	if oldRows != 0 || jobs != 0 {
		t.Fatal("deletion did not cascade or task remained")
	}
	if _, err := restored.Resolve(other.Token); err != nil {
		t.Fatal("another provider's account changed")
	}
	newer, err := restored.Login(ctx, Kakao, "test:123")
	if err != nil || newer.UserID == original.UserID {
		t.Fatal("account was resurrected", err)
	}
	// Neither a duplicate nor a delayed first delivery for the old account may delete the new one.
	for _, body := range []string{token, signedSET(t, key, setClaims(occurred, kakaoUnlinked, "123", "late-1"), "secevent+jwt")} {
		if res := eventHTTP(s, body); res.Code != 202 {
			t.Fatal(res.Code)
		}
	}
	if _, err := restored.Resolve(newer.Token); err != nil {
		t.Fatal("stale event affected recreated account")
	}
}

func TestKakaoSETKeepsOtherLinkedIdentityAndPrunesReceipts(t *testing.T) {
	s, now := eventService(t)
	ctx := context.Background()
	login, err := s.Login(ctx, Kakao, "test:123")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.db.Create(&Identity{UserID: login.UserID, Provider: string(Google), Subject: "456", CreatedAt: *now}).Error; err != nil {
		t.Fatal(err)
	}
	*now = now.Add(time.Minute)
	if err := s.acceptKakaoEvent(ctx, KakaoEvent{ID: "multi-1", Subject: "123", OccurredAt: now.Unix(), Unlinked: true}); err != nil {
		t.Fatal(err)
	}
	var ids []Identity
	s.db.Where("user_id = ?", login.UserID).Find(&ids)
	if len(ids) != 1 || ids[0].Provider != string(Google) {
		t.Fatal("other linked identity removed")
	}
	next, err := s.Login(ctx, Google, "test:456")
	if err != nil || next.UserID != login.UserID {
		t.Fatal("remaining provider cannot access own account", err)
	}
	var jobs int64
	s.db.Model(&KakaoDeletionJob{}).Count(&jobs)
	if jobs != 0 {
		t.Fatal("multi-provider account scheduled for deletion")
	}
	*now = now.Add(31 * 24 * time.Hour)
	if err := s.ProcessKakaoDeletions(ctx); err != nil {
		t.Fatal(err)
	}
	var receipts int64
	s.db.Model(&KakaoEventReceipt{}).Count(&receipts)
	if receipts != 0 {
		t.Fatal("receipt retention not enforced")
	}
}
