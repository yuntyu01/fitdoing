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

const adminToken = "admin-token-0123456789abcdef0123456789"

// namedMock answers like ai.Mock but puts its model name in the first food, so a test sees which model ran.
type namedMock struct{ name string }

func (m namedMock) Analyze(ctx context.Context, image []byte, ct string) (ai.Result, error) {
	r, err := ai.Mock{}.Analyze(ctx, image, ct)
	r.Items[0].Name = m.name
	return r, err
}

func newModelEnv(t *testing.T, token string, names ...string) *env {
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
		Options{AIModels: models, AdminToken: token})
	e.tok, e.uid = e.login("someone")
	return e
}

func (e *env) admin(method, path, body, token string) resp {
	e.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("X-Admin-Token", token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return e.serve(req)
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
	e := newModelEnv(t, adminToken, "gemini-3.5-flash-lite", "gemini-3.8-flash")
	otherTok, otherID := e.login("other")

	e.admin("GET", "/api/admin/ai-models", "", adminToken).is(t, 200).eq(t, "default", "gemini-3.5-flash-lite")
	if got := e.analyzedBy(e.tok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("default user: %s", got)
	}

	r := e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":"gemini-3.8-flash"}`, adminToken).is(t, 200)
	r.eq(t, "aiModel", "gemini-3.8-flash")
	r.eq(t, "effectiveModel", "gemini-3.8-flash")
	if got := e.analyzedBy(e.tok); got != "gemini-3.8-flash" {
		t.Fatalf("assigned user: %s", got)
	}
	if got := e.analyzedBy(otherTok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("other user must keep the default: %s", got)
	}

	list := e.admin("GET", "/api/admin/users?limit=10", "", adminToken).is(t, 200)
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
	e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":"gemini-9-ultra"}`, adminToken).code(t, 400, "INVALID")
	e.admin("PUT", "/api/admin/users/nobody/ai-model", `{"model":"gemini-3.8-flash"}`, adminToken).code(t, 404, "NOT_FOUND")

	// back to the default
	e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":null}`, adminToken).is(t, 200).eq(t, "aiModel", nil)
	if got := e.analyzedBy(e.tok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("after reset: %s", got)
	}

	// deleting the account removes the assignment with it
	e.admin("PUT", "/api/admin/users/"+otherID+"/ai-model", `{"model":"gemini-3.8-flash"}`, adminToken).is(t, 200)
	e.do("DELETE", "/api/account", "", otherTok).is(t, 204)
	if n := e.count("user_ai_models"); n != 0 {
		t.Fatalf("assignment survived the account: %d", n)
	}
}

func TestAdminAPIGuard(t *testing.T) {
	e := newModelEnv(t, adminToken, "gemini-3.5-flash-lite", "gemini-3.8-flash")
	e.admin("GET", "/api/admin/ai-models", "", "").code(t, 401, "UNAUTHORIZED")
	e.admin("GET", "/api/admin/ai-models", "", "wrong-token-wrong-token-wrong-token").code(t, 401, "UNAUTHORIZED")
	// a user's login token is not an admin token
	req := httptest.NewRequest("GET", "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+e.tok)
	e.serve(req).code(t, 401, "UNAUTHORIZED")

	off := newModelEnv(t, "", "gemini-3.5-flash-lite")
	off.admin("GET", "/api/admin/ai-models", "", adminToken).code(t, 404, "NOT_FOUND")
}

// A model removed from GEMINI_MODELS after it was assigned: the user falls back to the default, nothing breaks.
func TestAssignedModelRemovedFromConfig(t *testing.T) {
	e := newModelEnv(t, adminToken, "gemini-3.5-flash-lite", "gemini-3.8-flash")
	e.admin("PUT", "/api/admin/users/"+e.uid+"/ai-model", `{"model":"gemini-3.8-flash"}`, adminToken).is(t, 200)
	models, _ := ai.NewModelSet(e.db, "gemini-3.5-flash-lite", []string{"gemini-3.5-flash-lite"},
		map[string]ai.FoodAnalyzer{"gemini-3.5-flash-lite": namedMock{"gemini-3.5-flash-lite"}})
	e.srv = New(e.db, namedMock{"gemini-3.5-flash-lite"}, platform.Clock{Loc: time.UTC}, nil, newAuth(e.db),
		Options{AIModels: models, AdminToken: adminToken})
	if got := e.analyzedBy(e.tok); got != "gemini-3.5-flash-lite" {
		t.Fatalf("fallback: %s", got)
	}
	r := e.admin("GET", "/api/admin/users", "", adminToken).is(t, 200)
	r.eq(t, "users.0.aiModel", "gemini-3.8-flash") // still stored, shown to the admin
	r.eq(t, "users.0.effectiveModel", "gemini-3.5-flash-lite")
}
