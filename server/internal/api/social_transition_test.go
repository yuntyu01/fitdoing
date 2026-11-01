package api

import (
	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"testing"
	"time"
)

func TestProviderUpgradePreservesDeviceRecordsAndRetiresOldToken(t *testing.T) {
	e := newEnv(t)
	svc := newAuth(e.db)
	e.srv = New(e.db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, svc, Options{AuthDisabled: true})
	device := "device-6d393858-51db-4af5-9af3-1339bcd28292"
	e.do("POST", "/api/meals", mealBody("2026-09-26", 1, 1, 400, false), device).is(t, 200)
	uid, _ := svc.DevResolve(device)
	body := js(map[string]string{"provider": "google", "token": "ok:new-account", "legacyDeviceToken": device})
	r := e.do("POST", "/api/auth/login", body, "").is(t, 200)
	r.eq(t, "userId", uid)
	token := r.Body["token"].(string)
	meals := e.do("GET", "/api/meals?date=2026-09-26", "", token).is(t, 200)
	if len(meals.List) != 1 {
		t.Fatal("device records not preserved")
	}
	e.do("GET", "/api/settings", "", device).code(t, 401, "UNAUTHORIZED")
	e.do("GET", "/api/settings", "", token+"x").code(t, 401, "UNAUTHORIZED")
	e.do("POST", "/api/auth/login", body, "").is(t, 200).eq(t, "userId", uid)
	e.do("DELETE", "/api/account", "", token).is(t, 204)
	e.do("GET", "/api/settings", "", token).code(t, 401, "UNAUTHORIZED")
	e.do("GET", "/api/settings", "", device).code(t, 401, "UNAUTHORIZED")
	var n int64
	e.db.Table("users").Where("id = ?", uid).Count(&n)
	if n != 0 {
		t.Fatal("retired device recreated deleted account")
	}
}

func TestDeviceUpgradeRefusesUnverifiedAndDifferentAccounts(t *testing.T) {
	e := newEnv(t)
	svc := newAuth(e.db)
	e.srv = New(e.db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, svc, Options{AuthDisabled: true})
	device := "device-2af57b2c-8efb-4edc-aace-df15ad89960d"
	e.do("POST", "/api/meals", mealBody("2026-09-26", 1, 1, 400, false), device).is(t, 200)
	before := counts(e, "users", "identities", "meal_logs")
	for _, tc := range []struct {
		token  string
		status int
		code   string
	}{
		{"forged", 401, "AUTH_FAILED"},
		{"ok:main-user", 409, "ACCOUNT_LINK_CONFLICT"},
	} {
		e.do("POST", "/api/auth/login", js(map[string]string{"provider": "google", "token": tc.token, "legacyDeviceToken": device}), "").code(t, tc.status, tc.code)
	}
	for table, n := range before {
		if got := e.count(table); got != n {
			t.Fatalf("refused upgrade changed %s: %d -> %d", table, n, got)
		}
	}
	if r := e.do("GET", "/api/meals?date=2026-09-26", "", e.tok).is(t, 200); len(r.List) != 0 {
		t.Fatal("device records leaked into another account")
	}
	if r := e.do("GET", "/api/meals?date=2026-09-26", "", device).is(t, 200); len(r.List) != 1 {
		t.Fatal("original records inaccessible")
	}
}

func TestOfflineDeviceCannotOverwriteExistingProviderAccount(t *testing.T) {
	e := newEnv(t)
	e.srv = New(e.db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, newAuth(e.db), Options{AuthDisabled: true})
	device := "device-111c4855-45c3-49d4-933c-5d04fdd00f8a"
	e.do("POST", "/api/auth/login", js(map[string]string{"provider": "google", "token": "ok:main-user", "legacyDeviceToken": device}), "").code(t, 409, "ACCOUNT_LINK_CONFLICT")
	if e.count("users") != 1 || e.count("identities") != 1 {
		t.Fatal("refused offline migration changed accounts")
	}
	// A new provider account can receive this installation's local-only records.
	e.do("POST", "/api/auth/login", js(map[string]string{"provider": "google", "token": "ok:offline-new", "legacyDeviceToken": device}), "").is(t, 200).eq(t, "isNew", true)
}
