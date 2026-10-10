package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

const adminPassword = "운동하는-관리자-2026"

// namedMock answers like ai.Mock but puts its model name in the first food, so a test sees which model ran.
type namedMock struct{ name string }

func (m namedMock) Analyze(ctx context.Context, image []byte, ct string) (ai.Result, error) {
	r, err := ai.Mock{}.Analyze(ctx, image, ct)
	r.Items[0].Name = m.name
	return r, err
}

// adminNow is the admin session clock of the model envs; tests move it to expire sessions.
var adminNow = func() time.Time { return time.Now() }

func newModelEnv(t *testing.T, password string, names ...string) *env {
	t.Helper()
	db, err := platform.OpenDB("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	analyzers := map[string]ai.FoodAnalyzer{}
	for _, n := range names {
		analyzers[n] = namedMock{n}
	}
	models, err := ai.NewModelSet(db, names[0], names, analyzers)
	if err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, db: db}
	e.srv = New(db, analyzers[names[0]], platform.Clock{Loc: time.UTC}, nil, newAuth(db),
		Options{AIModels: models, AdminPassword: password, Now: func() time.Time { return adminNow() }})
	e.tok, e.uid = e.login("someone")
	return e
}

// adminLogin logs in from ip and returns the session cookie ("" when refused) and the response.
func (e *env) adminLogin(password, ip string) (string, *httptest.ResponseRecorder) {
	e.t.Helper()
	req := httptest.NewRequest("POST", "/api/admin/login", strings.NewReader(js(map[string]string{"password": password})))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", ip)
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	e.srv.ServeHTTP(rec, req)
	for _, c := range rec.Result().Cookies() {
		if c.Name == "fd_admin" && c.Value != "" {
			return c.Name + "=" + c.Value, rec
		}
	}
	return "", rec
}

// admin calls an admin API with the session cookie (cookie "" = none).
func (e *env) admin(method, path, body, cookie string) resp {
	e.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return e.serve(req)
}

func (e *env) adminCookie() string {
	e.t.Helper()
	c, rec := e.adminLogin(adminPassword, "10.0.0.1")
	if c == "" {
		e.t.Fatalf("admin login: %d %s", rec.Code, rec.Body.String())
	}
	return c
}

func (e *env) analyzedBy(tok string) string {
	e.t.Helper()
	rec := httptest.NewRecorder()
	e.srv.ServeHTTP(rec, multipartReq(e.t, tok, "photo", "image/jpeg", []byte{1, 2, 3}))
	if rec.Code != http.StatusOK {
		e.t.Fatalf("analyze status %d: %s", rec.Code, rec.Body.String())
	}
	model := rec.Header().Get("X-AI-Model")
	if !strings.Contains(rec.Body.String(), `"name":"`+model+`"`) {
		e.t.Fatalf("header says %s but another analyzer answered: %s", model, rec.Body.String())
	}
	return model
}

func TestAdminAssignsAIModelPerUser(t *testing.T) {
	e := newModelEnv(t, adminPassword, "gemini-3.5-flash-lite", "gemini-3.8-flash")
	otherTok, otherID := e.login("other")
	adminCookie := e.adminCookie()

	e.admin("GET", "/api/admin/ai-models", "", adminCookie).is(t, 200).eq(t, "default", "gemini-3.5-flash-lite")
	if got := e.analyzedBy(e.tok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("default user: %s", got)
	}

	r := e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":"gemini-3.8-flash"}`, adminCookie).is(t, 200)
	r.eq(t, "aiModel", "gemini-3.8-flash")
	r.eq(t, "effectiveModel", "gemini-3.8-flash")
	if got := e.analyzedBy(e.tok); got != "gemini-3.8-flash" {
		t.Fatalf("assigned user: %s", got)
	}
	if got := e.analyzedBy(otherTok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("other user must keep the default: %s", got)
	}

	list := e.admin("GET", "/api/admin/users?limit=10", "", adminCookie).is(t, 200)
	list.size(t, "users", 2)
	for i := 0; i < 2; i++ {
		row := at(t, list.Body, "users."+string(rune('0'+i))).(map[string]any)
		want := "gemini-3.5-flash-lite"
		if row["id"] == e.uid {
			want = "gemini-3.8-flash"
		}
		if row["effectiveModel"] != want {
			t.Fatalf("list row %v", row)
		}
	}

	// not allowed, unknown user, bad body
	e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":"gemini-9-ultra"}`, adminCookie).code(t, 400, "INVALID")
	e.admin("PUT", "/api/admin/users/nobody/ai-model", `{"model":"gemini-3.8-flash"}`, adminCookie).code(t, 404, "NOT_FOUND")

	// back to the default
	e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":null}`, adminCookie).is(t, 200).eq(t, "aiModel", nil)
	if got := e.analyzedBy(e.tok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("after reset: %s", got)
	}

	// deleting the account removes the assignment with it
	e.admin("PUT", "/api/admin/users/"+otherID+"/ai-model", `{"model":"gemini-3.8-flash"}`, adminCookie).is(t, 200)
	e.do("DELETE", "/api/account", "", otherTok).is(t, 204)
	if n := e.count("user_ai_models"); n != 0 {
		t.Fatalf("assignment survived the account: %d", n)
	}
}

func TestAdminPasswordLogin(t *testing.T) {
	e := newModelEnv(t, adminPassword, "gemini-3.5-flash-lite", "gemini-3.8-flash")
	e.admin("GET", "/api/admin/session", "", "").code(t, 401, "UNAUTHORIZED")

	cookie, rec := e.adminLogin(adminPassword, "10.0.0.1")
	if rec.Code != 204 || cookie == "" {
		t.Fatalf("login: %d %s", rec.Code, rec.Body.String())
	}
	sc := rec.Header().Get("Set-Cookie")
	for _, want := range []string{"HttpOnly", "Secure", "SameSite=Strict", "Max-Age=2592000", "Path=/"} {
		if !strings.Contains(sc, want) {
			t.Fatalf("cookie lacks %s: %s", want, sc)
		}
	}
	e.admin("GET", "/api/admin/session", "", cookie).is(t, 200)
	e.admin("GET", "/api/admin/ai-models", "", cookie).is(t, 200)

	// a forged or tampered cookie, or a user's login token, is not an admin session
	e.admin("GET", "/api/admin/users", "", "fd_admin=OTk5OTk5OTk5OS5hYmM").code(t, 401, "UNAUTHORIZED")
	req := httptest.NewRequest("GET", "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+e.tok)
	e.serve(req).code(t, 401, "UNAUTHORIZED")

	// the session lasts 30 days
	defer func() { adminNow = func() time.Time { return time.Now() } }()
	adminNow = func() time.Time { return time.Now().Add(29 * 24 * time.Hour) }
	e.admin("GET", "/api/admin/session", "", cookie).is(t, 200)
	adminNow = func() time.Time { return time.Now().Add(31 * 24 * time.Hour) }
	e.admin("GET", "/api/admin/session", "", cookie).code(t, 401, "UNAUTHORIZED")
	adminNow = func() time.Time { return time.Now() }

	// logout clears the cookie in the browser
	r := httptest.NewRecorder()
	lreq := httptest.NewRequest("POST", "/api/admin/logout", nil)
	lreq.Header.Set("Cookie", cookie)
	e.srv.ServeHTTP(r, lreq)
	if r.Code != 204 || !strings.Contains(r.Header().Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("logout: %d %v", r.Code, r.Header())
	}

	// changing ADMIN_PASSWORD ends every session
	changed := &env{t: t, db: e.db}
	models, _ := ai.NewModelSet(e.db, "gemini-3.5-flash-lite", []string{"gemini-3.5-flash-lite"},
		map[string]ai.FoodAnalyzer{"gemini-3.5-flash-lite": namedMock{"gemini-3.5-flash-lite"}})
	changed.srv = New(e.db, namedMock{"gemini-3.5-flash-lite"}, platform.Clock{Loc: time.UTC}, nil, newAuth(e.db),
		Options{AIModels: models, AdminPassword: "다른-비밀번호-0000"})
	changed.admin("GET", "/api/admin/session", "", cookie).code(t, 401, "UNAUTHORIZED")
}

func TestAdminLoginLimitsGuessing(t *testing.T) {
	e := newModelEnv(t, adminPassword, "gemini-3.5-flash-lite")
	for i := 0; i < 5; i++ {
		if _, rec := e.adminLogin("틀린-비밀번호", "203.0.113.7"); rec.Code != 401 {
			t.Fatalf("try %d: %d", i, rec.Code)
		}
	}
	// blocked for this client even with the right password; another client is not
	if c, rec := e.adminLogin(adminPassword, "203.0.113.7"); rec.Code != 429 || c != "" {
		t.Fatalf("after 5 failures: %d", rec.Code)
	}
	if c, rec := e.adminLogin(adminPassword, "198.51.100.2"); rec.Code != 204 || c == "" {
		t.Fatalf("other client: %d", rec.Code)
	}
	// after the window it works again
	defer func() { adminNow = func() time.Time { return time.Now() } }()
	adminNow = func() time.Time { return time.Now().Add(16 * time.Minute) }
	if c, rec := e.adminLogin(adminPassword, "203.0.113.7"); rec.Code != 204 || c == "" {
		t.Fatalf("after the window: %d", rec.Code)
	}
}

func TestAdminOffWithoutPassword(t *testing.T) {
	off := newModelEnv(t, "", "gemini-3.5-flash-lite")
	if _, rec := off.adminLogin("아무거나-아무거나", "10.0.0.1"); rec.Code != 404 {
		t.Fatalf("login without ADMIN_PASSWORD: %d", rec.Code)
	}
	off.admin("GET", "/api/admin/ai-models", "", "").code(t, 404, "NOT_FOUND")
}

// A model removed from GEMINI_MODELS after it was assigned: the user falls back to the default, nothing breaks.
func TestAssignedModelRemovedFromConfig(t *testing.T) {
	e := newModelEnv(t, adminPassword, "gemini-3.5-flash-lite", "gemini-3.8-flash")
	adminCookie := e.adminCookie()
	e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":"gemini-3.8-flash"}`, adminCookie).is(t, 200)
	models, _ := ai.NewModelSet(e.db, "gemini-3.5-flash-lite", []string{"gemini-3.5-flash-lite"},
		map[string]ai.FoodAnalyzer{"gemini-3.5-flash-lite": namedMock{"gemini-3.5-flash-lite"}})
	e.srv = New(e.db, namedMock{"gemini-3.5-flash-lite"}, platform.Clock{Loc: time.UTC}, nil, newAuth(e.db),
		Options{AIModels: models, AdminPassword: adminPassword})
	if got := e.analyzedBy(e.tok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("fallback: %s", got)
	}
	r := e.admin("GET", "/api/admin/users", "", adminCookie).is(t, 200)
	r.eq(t, "users.0.aiModel", "gemini-3.8-flash") // still stored, shown to the admin
	r.eq(t, "users.0.effectiveModel", "gemini-3.5-flash-lite")
}

func TestAdminPage(t *testing.T) {
	e := newModelEnv(t, adminPassword, "gemini-3.5-flash-lite", "gemini-3.8-flash")
	for path, ct := range map[string]string{"/admin": "text/html", "/admin/admin.js": "text/javascript", "/admin/admin.css": "text/css"} {
		rec := httptest.NewRecorder()
		e.srv.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != 200 || !strings.HasPrefix(rec.Header().Get("Content-Type"), ct) ||
			!strings.Contains(rec.Header().Get("Content-Security-Policy"), "script-src 'self'") {
			t.Fatalf("%s: %d %v", path, rec.Code, rec.Header())
		}
		if strings.Contains(rec.Body.String(), adminPassword) {
			t.Fatal("the page must not carry the password")
		}
	}
	off := newModelEnv(t, "", "gemini-3.5-flash-lite")
	rec := httptest.NewRecorder()
	off.srv.ServeHTTP(rec, httptest.NewRequest("GET", "/admin", nil))
	if rec.Code != 404 {
		t.Fatalf("admin page without ADMIN_PASSWORD: %d", rec.Code)
	}
}
