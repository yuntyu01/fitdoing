package api

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/auth"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func login(e *env, provider, token string) resp {
	return e.do("POST", "/api/auth/login", js(map[string]string{"provider": provider, "token": token}), "")
}

func TestLoginCreatesUserOnceAndReturnsSameUser(t *testing.T) {
	e := newEnv(t) // already logged in once as google "main-user"
	if e.count("users") != 1 || e.count("identities") != 1 {
		t.Fatalf("counts %v", counts(e, "users", "identities"))
	}
	again := login(e, "google", "ok:main-user").is(t, 200)
	again.eq(t, "userId", e.uid)
	again.eq(t, "isNew", false)
	if e.count("users") != 1 {
		t.Fatal("second login created another user")
	}
	// the same subject at another provider is another account
	r := login(e, "kakao", "ok:main-user").is(t, 200)
	r.eq(t, "isNew", true)
	if r.Body["userId"] == e.uid || e.count("users") != 2 {
		t.Fatal("kakao account must not share the google user")
	}
}

func TestLoginRefusals(t *testing.T) {
	e := newEnv(t)
	login(e, "naver", "ok:x").code(t, 400, "INVALID")
	login(e, "google", "").code(t, 400, "INVALID")
	login(e, "google", "forged").code(t, 401, "AUTH_FAILED")
	if e.count("users") != 1 {
		t.Fatal("a refused login created a user")
	}
}

func TestProviderWithoutKeysIs503(t *testing.T) {
	db, _ := platform.OpenDB("sqlite", ":memory:")
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	svc := auth.NewService(db, "test-secret-test-secret-test-secret-0123", map[auth.Provider]auth.Verifier{
		auth.Kakao: &auth.KakaoVerifier{}, // no app id
	}, nil)
	e := &env{t: t, db: db, srv: New(db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, svc)}
	login(e, "kakao", "anything").code(t, 503, "PROVIDER_NOT_CONFIGURED")
}

func TestExpiredAndForgedLoginTokensAreRefused(t *testing.T) {
	e := newEnv(t)
	e.get("/api/settings").is(t, 200)
	// a token from a server with another secret
	other := auth.NewService(e.db, "another-secret-another-secret-0123456", map[auth.Provider]auth.Verifier{auth.Google: fakeVerifier{}}, nil)
	forged, err := other.Login(t.Context(), auth.Google, "ok:main-user")
	if err != nil {
		t.Fatal(err)
	}
	e.do("GET", "/api/settings", "", forged.Token).code(t, 401, "UNAUTHORIZED")
	// a token that is already past its 90 days
	past := time.Now().Add(-auth.TokenTTL - time.Hour)
	oldSvc := auth.NewService(e.db, "test-secret-test-secret-test-secret-0123", map[auth.Provider]auth.Verifier{auth.Google: fakeVerifier{}}, func() time.Time { return past })
	old, err := oldSvc.Login(t.Context(), auth.Google, "ok:main-user")
	if err != nil {
		t.Fatal(err)
	}
	e.do("GET", "/api/settings", "", old.Token).code(t, 401, "UNAUTHORIZED")
}

func TestUsersOnlySeeTheirOwnData(t *testing.T) {
	e := newEnv(t)
	e.post("/api/meals", contract(t, "meal.json")).is(t, 200)
	other := e.otherToken("someone-else")
	snap := e.do("GET", "/api/sync/snapshot", "", other).is(t, 200)
	snap.size(t, "meals", 0)
	if snap.Body["settings"] != nil {
		t.Fatal("another user's settings leaked into the snapshot")
	}
	e.get("/api/sync/snapshot").is(t, 200).size(t, "meals", 1)
}

func TestDeleteAccountRemovesEverythingAndInvalidatesTheToken(t *testing.T) {
	e := newEnv(t)
	e.put("/api/sync/settings", contract(t, "settings.json")).is(t, 200)
	e.post("/api/sync/events", contract(t, "sync-events.json")).is(t, 200)
	e.post("/api/meals", contract(t, "meal.json")).is(t, 200)
	keep, _ := e.login("bystander")
	e.do("PUT", "/api/sync/settings", contract(t, "settings.json"), keep).is(t, 200)

	req := httptest.NewRequest("DELETE", "/api/account", nil)
	req.Header.Set("Authorization", "Bearer "+e.tok)
	if r := e.serve(req); r.Status != 204 {
		t.Fatalf("delete status %d %s", r.Status, r.Raw)
	}
	e.get("/api/settings").code(t, 401, "UNAUTHORIZED") // the old token no longer works
	for _, tb := range []string{"meal_logs", "meal_items", "gym_logs", "sleep_logs", "lock_events", "coupon_uses"} {
		if n := e.count(tb); n != 0 {
			t.Fatalf("%s still has %d rows", tb, n)
		}
	}
	if e.count("users") != 1 || e.count("identities") != 1 || e.count("user_settings") != 1 {
		t.Fatalf("another user's data was touched: %v", counts(e, "users", "identities", "user_settings"))
	}
	// logging in again with the same account starts a fresh, empty user
	r := login(e, "google", "ok:main-user").is(t, 200)
	r.eq(t, "isNew", true)
	if r.Body["userId"] == e.uid {
		t.Fatal("deleted user came back with the same id")
	}
}

func TestAuthDisabledAcceptsAnyTokenAsOneDevUser(t *testing.T) {
	db, _ := platform.OpenDB("sqlite", ":memory:")
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	svc := auth.NewService(db, "test-secret-test-secret-test-secret-0123", nil, nil)
	e := &env{t: t, db: db, srv: New(db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, svc, Options{AuthDisabled: true})}
	e.do("GET", "/api/settings", "", "dev").is(t, 200)
	e.do("GET", "/api/settings", "", "anything-else").is(t, 200)
	if e.count("users") != 1 {
		t.Fatalf("users = %d, want exactly the dev user", e.count("users"))
	}
}
