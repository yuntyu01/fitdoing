package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

type env struct {
	t   *testing.T
	srv http.Handler
	dev string
	db  *gorm.DB
}

type resp struct {
	Status int
	Body   map[string]any
	Raw    string
	List   []any
}

func newEnv(t *testing.T) *env {
	t.Helper()
	db, err := platform.OpenDB("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	clock := platform.Clock{Loc: time.UTC}
	return &env{t, New(db, ai.Mock{}, clock, []string{"*"}), "dev-" + uuid.NewString(), db}
}

func (e *env) do(method, path, body string, dev string) resp {
	e.t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, rd)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if dev != "" {
		req.Header.Set("X-Device-Id", dev)
	}
	return e.serve(req)
}

func (e *env) serve(req *http.Request) resp {
	e.t.Helper()
	rec := httptest.NewRecorder()
	e.srv.ServeHTTP(rec, req)
	r := resp{Status: rec.Code, Raw: rec.Body.String()}
	if strings.HasPrefix(strings.TrimSpace(r.Raw), "{") {
		if err := json.Unmarshal(rec.Body.Bytes(), &r.Body); err != nil {
			e.t.Fatalf("bad json %q: %v", r.Raw, err)
		}
	} else if strings.HasPrefix(strings.TrimSpace(r.Raw), "[") {
		_ = json.Unmarshal(rec.Body.Bytes(), &r.List)
	}
	return r
}

func (e *env) get(path string) resp        { return e.do("GET", path, "", e.dev) }
func (e *env) post(path, body string) resp { return e.do("POST", path, body, e.dev) }
func (e *env) put(path, body string) resp  { return e.do("PUT", path, body, e.dev) }

// at walks a JSON path such as "settings.meals.2.index" (numbers index arrays).
func at(t *testing.T, v any, path string) any {
	t.Helper()
	for _, p := range strings.Split(path, ".") {
		switch x := v.(type) {
		case map[string]any:
			var ok bool
			if v, ok = x[p]; !ok {
				return nil
			}
		case []any:
			var i int
			if _, err := fmt.Sscan(p, &i); err != nil || i >= len(x) {
				t.Fatalf("bad index %q in %q", p, path)
			}
			v = x[i]
		default:
			return nil
		}
	}
	return v
}

func (r resp) is(t *testing.T, status int) resp {
	t.Helper()
	if r.Status != status {
		t.Fatalf("status = %d, want %d: %s", r.Status, status, r.Raw)
	}
	return r
}

func (r resp) eq(t *testing.T, path string, want any) {
	t.Helper()
	got := at(t, r.Body, path)
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("%s = %v, want %v (body %s)", path, got, want, r.Raw)
	}
}

func (r resp) size(t *testing.T, path string, want int) {
	t.Helper()
	l, ok := at(t, r.Body, path).([]any)
	if !ok || len(l) != want {
		t.Fatalf("%s len = %v, want %d (body %s)", path, at(t, r.Body, path), want, r.Raw)
	}
}

func (r resp) code(t *testing.T, status int, code string) {
	t.Helper()
	r.is(t, status).eq(t, "code", code)
}

func mealBody(date string, index int, portion float64, kcal int, cheat bool) string {
	return fmt.Sprintf(`{"date":"%s","index":%d,"portion":%v,"sharedMeal":false,"cheat":%v,
	 "ai":{"items":[{"name":"밥","amount":"1공기"}],"kcal":%d,"carbs":50,"protein":20,"fat":10,"confidence":0.8}}`,
		date, index, portion, cheat, kcal)
}

// settingsMap returns the current settings as an editable map (like the app's PUT body).
func (e *env) settingsMap() map[string]any {
	e.t.Helper()
	return e.get("/api/settings").is(e.t, 200).Body["settings"].(map[string]any)
}

func js(v any) string { b, _ := json.Marshal(v); return string(b) }

func TestDeviceHeaderRequired(t *testing.T) {
	e := newEnv(t)
	e.do("GET", "/api/settings", "", "").code(t, 400, "DEVICE_ID")
	e.do("GET", "/api/settings", "", "short").code(t, 400, "DEVICE_ID")
	e.do("GET", "/api/settings", "", "bad id with spaces!").code(t, 400, "DEVICE_ID")
}

func TestDefaultsAndTargetFloor(t *testing.T) {
	e := newEnv(t)
	r := e.get("/api/settings").is(t, 200)
	r.eq(t, "settings.mode", "normal")
	r.size(t, "settings.meals", 4)
	s := e.settingsMap()
	s["targets"].(map[string]any)["kcal"] = 1000
	e.put("/api/settings", js(s)).code(t, 400, "TARGET_BELOW_MINIMUM")
}

func TestUserCanSetOwnTargets(t *testing.T) {
	e := newEnv(t)
	s := e.settingsMap()
	s["targets"] = map[string]any{"kcal": 1800, "carbs": 200, "protein": 130, "fat": 50}
	e.put("/api/settings", js(s)).is(t, 200).eq(t, "settings.targets.kcal", 1800)
	r := e.get("/api/settings").is(t, 200)
	r.eq(t, "settings.targets.protein", 130)
	r.eq(t, "settings.targets.carbs", 200)
	s["targets"].(map[string]any)["kcal"] = 1200
	e.put("/api/settings", js(s)).is(t, 200)
}

func TestSpicyModeAllowedForEveryone(t *testing.T) {
	e := newEnv(t)
	s := e.settingsMap()
	s["mode"] = "spicy"
	e.put("/api/settings", js(s)).is(t, 200).eq(t, "settings.mode", "spicy")
}

func TestLoweringModeAppliesNextWeek(t *testing.T) {
	e := newEnv(t)
	s := e.settingsMap()
	s["mode"] = "mild"
	r := e.put("/api/settings", js(s)).is(t, 200)
	r.eq(t, "settings.mode", "normal")
	r.eq(t, "pendingMode", "mild")
	if r.Body["pendingFrom"] == nil {
		t.Fatal("pendingFrom missing")
	}
	// the pending change is kept across reads
	e.get("/api/settings").is(t, 200).eq(t, "pendingMode", "mild")
}

func TestMealLogTodayAndRecords(t *testing.T) {
	e := newEnv(t)
	for i := 1; i <= 2; i++ {
		p := 1.0
		if i == 2 {
			p = 0.5
		}
		e.post("/api/meals", mealBody("2026-09-26", i, p, 400, false)).is(t, 200)
	}
	e.post("/api/meals", mealBody("2026-09-25", 1, 1, 400, false)).is(t, 200)

	r := e.get("/api/today?date=2026-09-26").is(t, 200)
	r.eq(t, "streak", 2)
	r.eq(t, "loggedCount", 2)
	r.eq(t, "total.kcal", 600) // 400 + 400*0.5
	r.size(t, "rows", 4)
	r.eq(t, "rows.2.logged", false)
	r.eq(t, "rows.2.target.kcal", 525)

	m := e.get("/api/records/month?month=2026-09").is(t, 200)
	m.size(t, "days", 30)
	m.eq(t, "days.25.state", "partial")
	m.eq(t, "summary.fullDays", 0)

	d := e.get("/api/records/day?date=2026-09-26").is(t, 200)
	d.size(t, "meals", 2)
	d.eq(t, "total.kcal", 600)
}

func TestMealOverwriteAndDelete(t *testing.T) {
	e := newEnv(t)
	e.post("/api/meals", mealBody("2026-09-26", 1, 1, 400, false)).is(t, 200)
	e.post("/api/meals", mealBody("2026-09-26", 1, 0.5, 800, false)).is(t, 200)
	l := e.get("/api/meals?date=2026-09-26")
	if len(l.List) != 1 {
		t.Fatalf("want 1 meal, got %s", l.Raw)
	}
	e.get("/api/today?date=2026-09-26").eq(t, "total.kcal", 400)
	e.do("DELETE", "/api/meals?date=2026-09-26&index=1", "", e.dev).is(t, 204)
	if l := e.get("/api/meals?date=2026-09-26"); len(l.List) != 0 {
		t.Fatalf("want empty, got %s", l.Raw)
	}
}

func TestMealIndexAndPortionValidated(t *testing.T) {
	e := newEnv(t)
	e.post("/api/meals", mealBody("2026-09-26", 6, 1, 400, false)).is(t, 400)
	e.post("/api/meals", mealBody("2026-09-26", 1, 0.7, 400, false)).is(t, 400)
	e.post("/api/meals", "{not json").code(t, 400, "INVALID")
}

func TestMealLockReleasedWhenLogged(t *testing.T) {
	e := newEnv(t)
	r := e.post("/api/locks", `{"type":"meal","date":"2026-09-26"}`).is(t, 200)
	if r.Body["endedAt"] != nil {
		t.Fatalf("endedAt should be empty: %s", r.Raw)
	}
	e.post("/api/meals", mealBody("2026-09-26", 1, 1, 400, false)).is(t, 200)
	e.get("/api/records/day?date=2026-09-26").eq(t, "locked", true)
	// the lock was released by the action
	again := e.post("/api/locks", `{"type":"meal","date":"2026-09-26"}`).is(t, 200)
	if again.Body["id"] == r.Body["id"] {
		t.Fatalf("expected a new lock after release: %s", again.Raw)
	}
	id := fmt.Sprint(r.Body["id"])
	e.post("/api/locks/"+id+"/release", `{"by":"time","date":"2026-09-26"}`).is(t, 200).eq(t, "releasedBy", "action")
}

func TestEmergencyReleaseLimitedPerWeek(t *testing.T) {
	e := newEnv(t)
	for i := 0; i < 3; i++ {
		id := fmt.Sprint(e.post("/api/locks", `{"type":"meal","date":"2026-09-23"}`).Body["id"])
		r := e.post("/api/locks/"+id+"/release", `{"by":"emergency","date":"2026-09-23"}`)
		if i < 2 {
			r.is(t, 200).eq(t, "releasedBy", "emergency")
		} else {
			r.code(t, 409, "COUPON_EMPTY")
		}
	}
	// reset on the next Monday
	e.get("/api/coupons?date=2026-09-28").eq(t, "emergency.left", 2)
}

func TestLockReleaseRules(t *testing.T) {
	e := newEnv(t)
	id := fmt.Sprint(e.post("/api/locks", `{"type":"meal","date":"2026-09-23"}`).Body["id"])
	e.post("/api/locks/"+id+"/release", `{"by":"coupon","date":"2026-09-23"}`).code(t, 400, "INVALID")
	e.post("/api/locks/9999/release", `{"by":"time","date":"2026-09-23"}`).code(t, 404, "NOT_FOUND")
	gid := fmt.Sprint(e.post("/api/locks", `{"type":"gym","date":"2026-09-23"}`).Body["id"])
	e.post("/api/locks/"+gid+"/release", `{"by":"coupon","date":"2026-09-23"}`).is(t, 200).eq(t, "releasedBy", "coupon")
	e.get("/api/coupons?date=2026-09-23").eq(t, "rest.left", 1)
	// another device cannot release it
	e.do("POST", "/api/locks/"+id+"/release", `{"by":"time","date":"2026-09-23"}`, "other-device-1").code(t, 404, "NOT_FOUND")
}

func TestRestCouponMarksGymAndDoesNotCountAsVisit(t *testing.T) {
	e := newEnv(t)
	e.post("/api/coupons/rest?date=2026-09-26", "").is(t, 200).eq(t, "rest.left", 1)
	e.get("/api/today?date=2026-09-26").eq(t, "gym.done", 0)
	e.post("/api/gym/check-in", `{"date":"2026-09-25","verifiedBy":"geofence"}`).is(t, 200)
	r := e.get("/api/today?date=2026-09-26")
	r.eq(t, "gym.done", 1)
	r.eq(t, "gym.planned", 5)
	e.post("/api/gym/check-in", `{"date":"2026-09-25","verifiedBy":"rest"}`).code(t, 400, "INVALID")
	e.get("/api/records/day?date=2026-09-26").eq(t, "gymVerifiedBy", "rest")
	e.get("/api/records/day?date=2026-09-26").eq(t, "gym", false)
}

func TestCheatCouponOnlyInSpicyAndNeverBlocks(t *testing.T) {
	e := newEnv(t)
	s := e.settingsMap()
	s["mode"] = "spicy"
	e.put("/api/settings", js(s)).is(t, 200)
	// 1500 > 2 x 525: spends a coupon. From the 3rd meal on there is none, but the meal is still recorded.
	left := []int{1, 0, 0}
	for i := 1; i <= 3; i++ {
		r := e.post("/api/meals", mealBody("2026-09-26", i, 1, 1500, false)).is(t, 200)
		r.eq(t, "meal.cheat", true)
		r.eq(t, "cheatLeft", left[i-1])
	}
	e.get("/api/records/day?date=2026-09-26").size(t, "meals", 3)
	// normal mode never spends one
	other := "dev-" + uuid.NewString()
	r := e.do("POST", "/api/meals", mealBody("2026-09-26", 1, 1, 1500, false), other).is(t, 200)
	r.eq(t, "meal.cheat", false)
	r.eq(t, "cheatLeft", 2)
}

func TestSleepResponseHidesDeviceID(t *testing.T) {
	e := newEnv(t)
	r := e.post("/api/sleep", `{"date":"2026-09-26","lockedAt":"2026-09-26T14:30:00Z"}`).is(t, 200)
	if _, ok := r.Body["deviceId"]; ok || strings.Contains(r.Raw, e.dev) {
		t.Fatalf("deviceId leaked: %s", r.Raw)
	}
	r.eq(t, "date", "2026-09-26")
	r = e.post("/api/sleep", `{"date":"2026-09-26","unlockedAt":"2026-09-26T22:00:00Z"}`).is(t, 200)
	if r.Body["lockedAt"] == nil || r.Body["unlockedAt"] == nil {
		t.Fatalf("sleep not merged: %s", r.Raw)
	}
	e.get("/api/records/month?month=2026-09").eq(t, "days.25.sleepLocked", true)
}

func multipartReq(t *testing.T, field, contentType string, data []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="a"`, field))
	h.Set("Content-Type", contentType)
	part, _ := w.CreatePart(h)
	part.Write(data)
	w.Close()
	req := httptest.NewRequest("POST", "/api/meals/analyze", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

func TestAnalyzeReturnsFixedSchema(t *testing.T) {
	e := newEnv(t)
	r := e.serve(multipartReq(t, "photo", "image/jpeg", []byte{1, 2, 3})).is(t, 200)
	if r.Body["items"] == nil || at(t, r.Body, "items.0.name") == nil {
		t.Fatalf("no items: %s", r.Raw)
	}
	for _, k := range []string{"kcal", "carbs", "protein", "fat", "confidence"} {
		if _, ok := r.Body[k].(float64); !ok {
			t.Fatalf("%s not a number: %s", k, r.Raw)
		}
	}
	// deterministic for the same photo
	r2 := e.serve(multipartReq(t, "photo", "image/jpeg", []byte{1, 2, 3}))
	if r.Raw != r2.Raw {
		t.Fatal("mock not deterministic")
	}
	e.serve(multipartReq(t, "photo", "text/plain", []byte{1})).code(t, 400, "INVALID_PHOTO")
	e.serve(multipartReq(t, "other", "image/jpeg", []byte{1})).code(t, 400, "INVALID_PHOTO")
	e.serve(multipartReq(t, "photo", "image/jpeg", make([]byte, 5<<20+10))).code(t, 413, "PHOTO_TOO_LARGE")
}

func TestRecommendTargets(t *testing.T) {
	e := newEnv(t)
	e.do("GET", "/api/targets/recommend?goal=lose&weightKg=70", "", "").is(t, 200).eq(t, "kcal", 1750)
	e.do("GET", "/api/targets/recommend?goal=nope&weightKg=70", "", "").code(t, 400, "INVALID")
}

func TestHealthzAndCORS(t *testing.T) {
	e := newEnv(t)
	e.do("GET", "/healthz", "", "").is(t, 200).eq(t, "status", "ok")
	req := httptest.NewRequest("OPTIONS", "/api/settings", nil)
	req.Header.Set("Origin", "http://localhost:8081")
	req.Header.Set("Access-Control-Request-Method", "PUT")
	rec := httptest.NewRecorder()
	e.srv.ServeHTTP(rec, req)
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Origin") != "*" ||
		!strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "X-Device-Id") {
		t.Fatalf("bad preflight: %d %v", rec.Code, rec.Header())
	}
}

func TestWeeklyStats(t *testing.T) {
	e := newEnv(t)
	// last week Mon/Tue, this week Wed/Thu, today (Sat 9/26) in progress, shared meal counts half
	for _, d := range []string{"2026-09-14", "2026-09-15", "2026-09-23", "2026-09-24"} {
		e.post("/api/meals", mealBody(d, 1, 1, 1600, false)).is(t, 200)
	}
	e.post("/api/meals", mealBody("2026-09-26", 1, 1, 800, false)).is(t, 200)

	r := e.get("/api/stats/weekly?date=2026-09-26").is(t, 200)
	r.eq(t, "weekStart", "2026-09-21")
	r.size(t, "days", 7)
	for i, want := range []string{"missing", "missing", "done", "done", "missing", "today", "future"} {
		r.eq(t, "days."+strconv.Itoa(i)+".state", want)
	}
	r.eq(t, "days.0.last.kcal", 1600)
	r.eq(t, "days.2.last", nil)
	r.eq(t, "days.5.current.kcal", 800)
	r.eq(t, "avg.kcal", 1600)     // Wed/Thu only, today excluded
	r.eq(t, "lastAvg.kcal", 1600) // last week Mon/Tue
	r.eq(t, "bandPct", 10)
	r.eq(t, "targets.kcal", 2100)

	// another device sees nothing
	e.do("GET", "/api/stats/weekly?date=2026-09-26", "", "other-device-123").is(t, 200).eq(t, "avg", nil)
	e.get("/api/stats/weekly").is(t, 400)
}
