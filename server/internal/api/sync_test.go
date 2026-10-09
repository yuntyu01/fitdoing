package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// the app <-> server contract examples; the server must accept them as they are
const contractDir = "../../../docs/contract/"

func contract(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(contractDir, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func parse(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func (e *env) count(table string) int {
	e.t.Helper()
	var n int64
	if err := e.db.Table(table).Count(&n).Error; err != nil {
		e.t.Fatal(err)
	}
	return int(n)
}

func counts(e *env, tables ...string) map[string]int {
	m := map[string]int{}
	for _, t := range tables {
		m[t] = e.count(t)
	}
	return m
}

var allTables = []string{"users", "identities", "user_settings", "meal_slots", "gym_days", "allowed_apps", "meal_logs",
	"meal_items", "gym_logs", "sleep_logs", "lock_events", "coupon_uses"}

// sameSet compares two JSON lists ignoring order.
func sameSet(t *testing.T, name string, got, want any) {
	t.Helper()
	norm := func(v any) []string {
		l, _ := v.([]any)
		out := make([]string, len(l))
		for i, x := range l {
			b, _ := json.Marshal(x)
			out[i] = string(b)
		}
		sort.Strings(out)
		return out
	}
	if !reflect.DeepEqual(norm(got), norm(want)) {
		t.Fatalf("%s differ:\n got %v\nwant %v", name, norm(got), norm(want))
	}
}

func TestSyncSettingsContractIdempotent(t *testing.T) {
	e := newEnv(t)
	body := contract(t, "settings.json")
	want := parse(t, body)
	var first map[string]int
	for i := 0; i < 2; i++ {
		r := e.put("/api/sync/settings", body).is(t, 200)
		if !reflect.DeepEqual(r.Body["settings"], want) {
			t.Fatalf("settings = %s", r.Raw)
		}
		if r.Body["pendingMode"] != nil || r.Body["pendingFrom"] != nil {
			t.Fatalf("pending set: %s", r.Raw)
		}
		c := counts(e, allTables...)
		if i == 0 {
			first = c
		} else if !reflect.DeepEqual(first, c) {
			t.Fatalf("row counts changed: %v -> %v", first, c)
		}
	}
	// normalized: one row each for the scalar part, one per child
	for table, n := range map[string]int{"users": 1, "user_settings": 1, "meal_slots": 4, "gym_days": 5, "allowed_apps": 1} {
		if first[table] != n {
			t.Fatalf("%s rows = %d, want %d", table, first[table], n)
		}
	}
	// the existing endpoint reads the same normalized data
	if got := e.get("/api/settings").is(t, 200).Body["settings"]; !reflect.DeepEqual(got, want) {
		t.Fatalf("GET /api/settings = %v", got)
	}
	// children are replaced, not appended
	s := parse(t, body)
	s["allowedApps"] = []any{"a.b", "c.d"}
	s["gym"].(map[string]any)["days"] = []any{1}
	e.put("/api/sync/settings", js(s)).is(t, 200)
	if e.count("allowed_apps") != 2 || e.count("gym_days") != 1 {
		t.Fatalf("children not replaced: %v", counts(e, allTables...))
	}
}

func TestSyncSettingsIsAPlainBackup(t *testing.T) {
	e := newEnv(t)
	e.put("/api/settings", js(e.settingsMap())).is(t, 200) // normal
	s := parse(t, contract(t, "settings.json"))
	s["mode"] = "mild"                                                              // lowering is not delayed
	s["targets"] = map[string]any{"kcal": 1000, "carbs": 1, "protein": 1, "fat": 1} // below the floor
	s["meals"] = []any{map[string]any{"index": 1, "deadline": "08:00"}, map[string]any{"index": 2, "deadline": "12:00"},
		map[string]any{"index": 4, "deadline": "19:00"}} // not consecutive
	r := e.put("/api/sync/settings", js(s)).is(t, 200)
	r.eq(t, "settings.mode", "mild")
	r.eq(t, "settings.targets.kcal", 1000)
	r.size(t, "settings.meals", 3)
	// the regular endpoint still rejects the same body
	e.put("/api/settings", js(s)).code(t, 400, "TARGET_BELOW_MINIMUM")
	// format errors are 400
	s["meals"].([]any)[0].(map[string]any)["deadline"] = "8am"
	e.put("/api/sync/settings", js(s)).code(t, 400, "INVALID")
	s = parse(t, contract(t, "settings.json"))
	s["heightCm"] = "tall"
	e.put("/api/sync/settings", js(s)).code(t, 400, "INVALID")
	s = parse(t, contract(t, "settings.json"))
	s["meals"] = []any{map[string]any{"index": 1, "deadline": "08:00"}, map[string]any{"index": 1, "deadline": "09:00"},
		map[string]any{"index": 2, "deadline": "10:00"}}
	e.put("/api/sync/settings", js(s)).code(t, 400, "INVALID")
	e.do("PUT", "/api/sync/settings", contract(t, "settings.json"), "").code(t, 401, "UNAUTHORIZED")
}

func TestSyncEventsContractIdempotentAndSnapshot(t *testing.T) {
	e := newEnv(t)
	body := contract(t, "sync-events.json")
	want := parse(t, body)
	var first map[string]int
	for i := 0; i < 2; i++ {
		r := e.post("/api/sync/events", body).is(t, 200)
		r.eq(t, "gymLogs", 2)
		r.eq(t, "sleepLogs", 1)
		r.eq(t, "lockEvents", 2)
		r.eq(t, "couponUses", 1)
		c := counts(e, allTables...)
		if i == 0 {
			first = c
		} else if !reflect.DeepEqual(first, c) {
			t.Fatalf("row counts changed: %v -> %v", first, c)
		}
	}
	snap := e.get("/api/sync/snapshot").is(t, 200)
	for _, k := range []string{"gymLogs", "sleepLogs", "lockEvents", "couponUses"} {
		sameSet(t, k, snap.Body[k], want[k])
	}
	// settings stay null until something is stored; then the snapshot has the contract shape
	if snap.Body["settings"] != nil {
		t.Fatalf("settings = %v", snap.Body["settings"])
	}
	e.put("/api/sync/settings", contract(t, "settings.json")).is(t, 200)
	snap = e.get("/api/sync/snapshot").is(t, 200)
	if !reflect.DeepEqual(snap.Body["settings"], parse(t, contract(t, "settings.json"))) {
		t.Fatalf("snapshot settings = %v", snap.Body["settings"])
	}
}

func TestSyncEventsMergeRules(t *testing.T) {
	e := newEnv(t)
	post := func(s string) { e.post("/api/sync/events", s).is(t, 200) }
	post(`{"sleepLogs":[{"date":"2026-09-25","lockedAt":1000,"unlockedAt":null}],
	 "lockEvents":[{"type":"gym","date":"2026-09-26","startedAt":5000,"endedAt":null,"releasedBy":null}]}`)
	post(`{"sleepLogs":[{"date":"2026-09-25","lockedAt":null,"unlockedAt":2000}],
	 "lockEvents":[{"type":"gym","date":"2026-09-26","startedAt":5000,"endedAt":6000,"releasedBy":"action"}]}`)
	snap := e.get("/api/sync/snapshot").is(t, 200)
	snap.eq(t, "sleepLogs.0.lockedAt", 1000) // null does not erase
	snap.eq(t, "sleepLogs.0.unlockedAt", 2000)
	snap.eq(t, "lockEvents.0.endedAt", 6000)
	snap.eq(t, "lockEvents.0.releasedBy", "action")
	// no rule checks: three emergency uses with a limit of two are stored as sent
	post(`{"couponUses":[{"type":"emergency","usedAt":1,"weekKey":"2026-09-21"},{"type":"emergency","usedAt":2,"weekKey":"2026-09-21"},
	 {"type":"emergency","usedAt":3,"weekKey":"2026-09-21"}]}`)
	if e.count("coupon_uses") != 3 || e.count("lock_events") != 1 || e.count("sleep_logs") != 1 {
		t.Fatalf("counts %v", counts(e, allTables...))
	}
	// the same body again changes nothing and the response counts processed items
	e.post("/api/sync/events", `{"couponUses":[{"type":"emergency","usedAt":1,"weekKey":"2026-09-21"}]}`).is(t, 200).eq(t, "couponUses", 1)
	if e.count("coupon_uses") != 3 {
		t.Fatal("coupon duplicated")
	}
	e.post("/api/sync/events", `{}`).is(t, 200).eq(t, "gymLogs", 0)
}

func TestSyncEventsRollBackOnBadItem(t *testing.T) {
	e := newEnv(t)
	// everything before the bad (last) item is valid and applied inside the transaction
	bad := []string{
		`"couponUses":[{"type":"rest","usedAt":1790160000000,"weekKey":"2026-09-21"},{"type":"bogus","usedAt":2,"weekKey":"2026-09-21"}]`,
		`"couponUses":[{"type":"rest","usedAt":1790160000000,"weekKey":"2026-09-21"},{"type":"rest","usedAt":-5,"weekKey":"2026-09-21"}]`,
		`"lockEvents":[{"type":"meal","date":"2026-09-24","startedAt":1,"endedAt":null,"releasedBy":null},{"type":"gym","date":"2026-09-24","startedAt":2,"releasedBy":"nope"}]`,
	}
	for _, b := range bad {
		e.post("/api/sync/events", `{"gymLogs":[{"date":"2026-09-25","verifiedBy":"photo","checkInAt":1790330400000}],
		 "sleepLogs":[{"date":"2026-09-25","lockedAt":1,"unlockedAt":2}],`+b+`}`).code(t, 400, "INVALID")
		for table, n := range counts(e, allTables[2:]...) { // not users/identities: the login made those
			if n != 0 {
				t.Fatalf("%s has %d rows after a failed request (%s)", table, n, b)
			}
		}
	}
}

func TestMealItemsNormalizedAndSnapshot(t *testing.T) {
	e := newEnv(t)
	body := contract(t, "meal.json")
	want := parse(t, body)
	for i := 0; i < 2; i++ { // the same slot is overwritten: still 2 item rows
		r := e.post("/api/meals", body).is(t, 200)
		r.size(t, "meal.items", 2)
		r.eq(t, "meal.items.0.name", "닭가슴살 샐러드")
		if e.count("meal_logs") != 1 || e.count("meal_items") != 2 {
			t.Fatalf("counts %v", counts(e, allTables...))
		}
	}
	snap := e.get("/api/sync/snapshot").is(t, 200)
	snap.size(t, "meals", 1)
	snap.eq(t, "meals.0.items.1.name", "고구마")
	snap.eq(t, "meals.0.deadline", want["deadline"])
	snap.eq(t, "meals.0.nutrition.kcal", 380)
	r := e.get("/api/meals?date=2026-09-26").is(t, 200)
	if len(r.List) != 1 {
		t.Fatalf("meals = %s", r.Raw)
	}
	// fewer items on overwrite removes the old rows
	one := parse(t, body)
	one["ai"].(map[string]any)["items"] = []any{map[string]any{"name": "밥", "amount": "1공기"}}
	e.post("/api/meals", js(one)).is(t, 200).size(t, "meal.items", 1)
	if e.count("meal_items") != 1 {
		t.Fatalf("items = %d", e.count("meal_items"))
	}
	// deleting the meal cascades to its items
	e.do("DELETE", "/api/meals?date=2026-09-26&index=1", "", e.tok).is(t, 204)
	if e.count("meal_items") != 0 || e.count("meal_logs") != 0 {
		t.Fatalf("counts %v", counts(e, allTables...))
	}
}

func TestUserDeleteCascadesEverywhere(t *testing.T) {
	e := newEnv(t)
	e.put("/api/sync/settings", contract(t, "settings.json")).is(t, 200)
	e.post("/api/sync/events", contract(t, "sync-events.json")).is(t, 200)
	e.post("/api/meals", contract(t, "meal.json")).is(t, 200)
	for _, tb := range allTables {
		if e.count(tb) == 0 {
			t.Fatalf("%s is empty before delete", tb)
		}
	}
	if err := e.db.Exec("DELETE FROM users WHERE id = ?", e.uid).Error; err != nil {
		t.Fatal(err)
	}
	for _, tb := range allTables {
		if n := e.count(tb); n != 0 {
			t.Fatalf("%s still has %d rows", tb, n)
		}
	}
	// a child cannot exist without its user
	if err := e.db.Exec("INSERT INTO gym_days (user_id, weekday) VALUES ('nobody-here', 1)").Error; err == nil {
		t.Fatal("foreign key not enforced")
	}
}

func TestEnumChecksAndUniqueKeys(t *testing.T) {
	e := newEnv(t)
	e.get("/api/settings").is(t, 200)
	if err := e.db.Exec("UPDATE user_settings SET mode = 'wild'").Error; err == nil {
		t.Fatal("mode check missing")
	}
	e.post("/api/sync/events", `{"couponUses":[{"type":"rest","usedAt":1,"weekKey":"2026-09-21"}]}`).is(t, 200)
	if err := e.db.Exec("INSERT INTO coupon_uses (device_id, type, used_at, week_key) SELECT device_id, type, used_at, week_key FROM coupon_uses").Error; err == nil {
		t.Fatal("coupon_uses unique key missing")
	}
}

func TestMealLogIsAtomic(t *testing.T) {
	e := newEnv(t)
	s := e.settingsMap()
	s["mode"] = "spicy"
	e.put("/api/settings", js(s)).is(t, 200)
	// a cheat meal spends a coupon; make that insert fail and the whole meal must roll back
	if err := e.db.Exec(`CREATE TRIGGER no_coupons BEFORE INSERT ON coupon_uses BEGIN SELECT RAISE(ABORT, 'boom'); END`).Error; err != nil {
		t.Fatal(err)
	}
	e.post("/api/meals", mealBody("2026-09-28", 1, 1, 500, true)).is(t, 500)
	if e.count("meal_logs") != 0 || e.count("meal_items") != 0 {
		t.Fatalf("partial write: %v", counts(e, allTables...))
	}
	e.db.Exec("DROP TRIGGER no_coupons")
	e.post("/api/meals", mealBody("2026-09-28", 1, 1, 500, true)).is(t, 200)
	if e.count("meal_logs") != 1 || e.count("coupon_uses") != 1 {
		t.Fatalf("counts %v", counts(e, allTables...))
	}
}

func TestEmptySnapshot(t *testing.T) {
	e := newEnv(t)
	r := e.get("/api/sync/snapshot").is(t, 200)
	if r.Body["settings"] != nil {
		t.Fatalf("settings = %v", r.Body["settings"])
	}
	for _, k := range []string{"meals", "gymLogs", "sleepLogs", "lockEvents", "couponUses"} {
		r.size(t, k, 0)
	}
	e.do("GET", "/api/sync/snapshot", "", "").code(t, 401, "UNAUTHORIZED")
}

func TestMigrateDropsDeviceKeyedSchema(t *testing.T) {
	cases := map[string][]string{
		"before login (devices table)": {
			`CREATE TABLE devices (device_id text PRIMARY KEY, created_at datetime NOT NULL)`,
			`CREATE TABLE meal_logs (id text PRIMARY KEY, device_id text NOT NULL, meal_date text NOT NULL, meal_index integer NOT NULL)`,
			`INSERT INTO devices VALUES ('legacy-device-1', '2026-09-01 00:00:00')`,
			`INSERT INTO meal_logs VALUES ('m1','legacy-device-1','2026-09-26',1)`,
		},
		"before normalization (settings as JSON)": {
			`CREATE TABLE user_settings (device_id text PRIMARY KEY, json text NOT NULL, updated_at datetime NOT NULL)`,
			`INSERT INTO user_settings VALUES ('legacy-device-1', '{}', '2026-09-01 00:00:00')`,
		},
	}
	for name, stmts := range cases {
		t.Run(name, func(t *testing.T) {
			db, err := platform.OpenDB("sqlite", ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			for _, q := range stmts {
				if err := db.Exec(q).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := Migrate(db); err != nil {
				t.Fatal(err)
			}
			m := db.Migrator()
			if m.HasTable("devices") || m.HasColumn("meal_logs", "device_id") || m.HasColumn("user_settings", "device_id") {
				t.Fatal("device-keyed schema remains")
			}
			e := &env{t: t, db: db, srv: New(db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, newAuth(db))}
			e.tok, e.uid = e.login("someone")
			e.get("/api/settings").is(t, 200).eq(t, "settings.heightCm", 175)
			if n := e.count("meal_logs"); n != 0 {
				t.Fatalf("old rows survived: %d", n)
			}
			if err := Migrate(db); err != nil { // running it again keeps the data
				t.Fatal(err)
			}
			if n := e.count("users"); n != 1 {
				t.Fatalf("users = %d", n)
			}
		})
	}
}
