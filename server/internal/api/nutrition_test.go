package api

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
)

// Nutrition targets: the newer settings fields must survive saves by older apps, stay "unknown" until entered,
// keep targets per date, and work on databases created before them.

// oldAppBody is the contract body without the 2026-10 fields, as an older app sends it.
func oldAppBody(t *testing.T) map[string]any {
	s := parse(t, contract(t, "settings.json"))
	for _, k := range []string{"sex", "age", "activity", "activityInput", "nutrition", "targetHistory", "foodStyle", "allergies", "fasting"} {
		delete(s, k)
	}
	return s
}

func TestNewFieldsUnknownUntilEntered(t *testing.T) {
	e := newEnv(t)
	r := e.get("/api/settings").is(t, 200)
	for _, k := range []string{"sex", "age", "activity", "nutrition", "activityInput", "foodStyle", "allergies", "fasting"} {
		r.eq(t, "settings."+k, nil) // never a guessed default (male, 30, low)
	}
	r.size(t, "settings.targetHistory", 0)
	r.eq(t, "settings.targets.kcal", 2100) // placeholder target is unchanged
}

func TestOlderAppSaveKeepsNewFields(t *testing.T) {
	for _, path := range []string{"/api/sync/settings", "/api/settings"} {
		t.Run(path, func(t *testing.T) {
			e := newEnv(t)
			e.put("/api/sync/settings", contract(t, "settings.json")).is(t, 200)
			old := oldAppBody(t)
			old["nickname"] = "구버전"
			r := e.put(path, js(old)).is(t, 200)
			r.eq(t, "settings.nickname", "구버전")
			r.eq(t, "settings.sex", "male")
			r.eq(t, "settings.age", float64(30))
			r.eq(t, "settings.activity", "low")
			r.eq(t, "settings.nutrition.plan.mode", "training")
			r.eq(t, "settings.foodStyle.pattern", "vegetarian")
			r.eq(t, "settings.allergies.0", "땅콩")
			r.size(t, "settings.targetHistory", 2)
		})
	}
}

func TestExplicitNullClearsNewFields(t *testing.T) {
	e := newEnv(t)
	e.put("/api/sync/settings", contract(t, "settings.json")).is(t, 200)
	s := parse(t, contract(t, "settings.json"))
	s["sex"], s["age"], s["activity"], s["nutrition"] = nil, nil, nil, nil
	r := e.put("/api/sync/settings", js(s)).is(t, 200)
	r.eq(t, "settings.sex", nil)
	r.eq(t, "settings.age", nil)
	r.eq(t, "settings.activity", nil)
	r.eq(t, "settings.nutrition", nil)
	r.eq(t, "settings.foodStyle.pattern", "vegetarian")
}

func TestNewFieldValidation(t *testing.T) {
	e := newEnv(t)
	for name, mut := range map[string]func(map[string]any){
		"activity case": func(s map[string]any) { s["activity"] = "VERYACTIVE" },
		"sex":           func(s map[string]any) { s["sex"] = "other" },
		"age":           func(s map[string]any) { s["age"] = 7 },
		"nutrition":     func(s map[string]any) { s["nutrition"] = map[string]any{"plan": map[string]any{"mode": "keto"}} },
		"food style":    func(s map[string]any) { s["foodStyle"] = map[string]any{"pattern": "paleo"} },
		"history date":  func(s map[string]any) { s["targetHistory"] = []any{map[string]any{"from": "10/08", "kcal": 1}} },
		"fasting":       func(s map[string]any) { s["fasting"] = map[string]any{"eatFrom": "8am", "eatTo": "20:00"} },
	} {
		t.Run(name, func(t *testing.T) {
			s := parse(t, contract(t, "settings.json"))
			mut(s)
			e.put("/api/sync/settings", js(s)).code(t, 400, "INVALID")
		})
	}
	s := parse(t, contract(t, "settings.json"))
	s["activity"] = "veryActive"
	e.put("/api/sync/settings", js(s)).is(t, 200).eq(t, "settings.activity", "veryActive")
}

func TestBulkGoalAndGainCompat(t *testing.T) {
	e := newEnv(t)
	for _, g := range []string{"bulk", "gain"} {
		s := parse(t, contract(t, "settings.json"))
		s["goal"] = g
		e.put("/api/sync/settings", js(s)).is(t, 200).eq(t, "settings.goal", g)
		e.get("/api/settings").is(t, 200).eq(t, "settings.goal", g)
	}
}

// Changing targets must not change how past days of the week are judged.
func TestWeeklyUsesTargetsOfEachDay(t *testing.T) {
	e := newEnv(t)
	s := parse(t, contract(t, "settings.json"))
	s["targets"] = map[string]any{"kcal": 1600, "carbs": 180, "protein": 100, "fat": 53}
	s["targetHistory"] = []any{
		map[string]any{"from": "2000-01-01", "kcal": 2100, "carbs": 283, "protein": 112, "fat": 58},
		map[string]any{"from": "2026-09-24", "kcal": 1600, "carbs": 180, "protein": 100, "fat": 53},
	}
	e.put("/api/sync/settings", js(s)).is(t, 200)
	for _, d := range []string{"2026-09-23", "2026-09-24"} {
		e.post("/api/meals", mealBody(d, 1, 1, 1600, false)).is(t, 200)
	}
	r := e.get("/api/stats/weekly?date=2026-09-26").is(t, 200)
	r.eq(t, "targets.kcal", 1600)
	// Wed 1600 vs 2100 then (outside), Thu 1600 vs 1600 (within)
	r.eq(t, "summary.kcal.completed", 2)
	r.eq(t, "summary.kcal.achieved", 1)
	r.eq(t, "summary.kcal.furthest.index", 2)
	r.eq(t, "summary.kcal.furthest.diff", -500)
	e.get("/api/records/day?date=2026-09-23").is(t, 200).eq(t, "targets.kcal", 2100)
	e.get("/api/records/day?date=2026-09-24").is(t, 200).eq(t, "targets.kcal", 1600)
}

// An older app that only sends targets: the server records the change from today, past dates keep the old target.
func TestOlderAppTargetChangeRecordsHistory(t *testing.T) {
	e := newEnv(t)
	e.get("/api/settings").is(t, 200) // defaults, 2100
	old := oldAppBody(t)
	old["targets"] = map[string]any{"kcal": 1800, "carbs": 200, "protein": 120, "fat": 60}
	r := e.put("/api/sync/settings", js(old)).is(t, 200)
	today := platform.Clock{Loc: time.UTC}.Today()
	r.size(t, "settings.targetHistory", 2)
	r.eq(t, "settings.targetHistory.0.from", "2000-01-01")
	r.eq(t, "settings.targetHistory.0.kcal", float64(2100))
	r.eq(t, "settings.targetHistory.1.from", string(today))
	e.get("/api/records/day?date=2026-01-01").is(t, 200).eq(t, "targets.kcal", 2100)
}

func TestRecommendLegacyAndEER(t *testing.T) {
	e := newEnv(t)
	q := func(s string) resp { return e.do("GET", "/api/targets/recommend?"+s, "", "") }
	// legacy requests answer exactly as before
	q("goal=lose&weightKg=70").is(t, 200).eq(t, "kcal", 1750)
	q("goal=keep&weightKg=70").is(t, 200).eq(t, "kcal", 2100)
	q("goal=bulk&weightKg=70").code(t, 400, "INVALID")
	// EER: 40y male 172cm 70kg low = 2547.21132 kcal (independent calculation), keep -> 2550
	body := "&weightKg=70&heightCm=172&age=40&sex=male&activity=low"
	r := q("goal=keep"+body).is(t, 200)
	r.eq(t, "kcal", 2550)
	r.eq(t, "mode", "balanced")
	r.eq(t, "carbs", 351)   // 2550 x 55% / 4 = 350.625
	r.eq(t, "protein", 128) // 2550 x 20% / 4 = 127.5
	r.eq(t, "fat", 71)      // 2550 x 25% / 9 = 70.83
	q("goal=lose"+body).is(t, 200).eq(t, "kcal", 2050)
	q("goal=gain"+body).is(t, 200).eq(t, "kcal", 2800)
	q("goal=bulk"+body).is(t, 200).eq(t, "kcal", 3050)
	tr := q("goal=keep&mode=training"+body).is(t, 200)
	tr.eq(t, "protein", 112) // 70 x 1.6
	tr.eq(t, "carbs", 366)   // (2550 - 448 - 637.5) / 4 = 366.125
	q("goal=keep&weightKg=70&heightCm=172&age=40&sex=male&activity=veryActive").is(t, 200).eq(t, "kcal", 3300)
	q("goal=keep&weightKg=70&heightCm=172").code(t, 400, "INVALID")                                 // partial body
	q("goal=keep&weightKg=70&heightCm=172&age=17&sex=male&activity=low").code(t, 400, "ADULT_ONLY") // minors
	q("goal=keep&weightKg=70&heightCm=172&age=40&sex=male&activity=LOW").code(t, 400, "INVALID")
}

// legacySettingsRow is user_settings as created before 2026-10 (goal check without 'bulk', no new columns).
type legacySettingsRow struct {
	UserID           string    `gorm:"column:user_id;primaryKey;size:64"`
	Mode             string    `gorm:"column:mode;size:8;not null;check:ck_user_settings_mode,mode IN ('mild','normal','spicy')"`
	PendingMode      *string   `gorm:"column:pending_mode;size:8;check:ck_user_settings_pending,pending_mode IN ('mild','normal','spicy')"`
	PendingFrom      *string   `gorm:"column:pending_from;size:10"`
	Goal             string    `gorm:"column:goal;size:8;not null;check:ck_user_settings_goal,goal IN ('lose','keep','gain')"`
	HeightCm         int       `gorm:"column:height_cm;not null"`
	WeightKg         float64   `gorm:"column:weight_kg;not null"`
	LockMinutes      int       `gorm:"column:lock_minutes;not null"`
	EmergencyPerWeek int       `gorm:"column:emergency_per_week;not null"`
	PhotoBackup      bool      `gorm:"column:photo_backup;not null"`
	CouponRest       int       `gorm:"column:coupon_rest;not null"`
	CouponCheat      int       `gorm:"column:coupon_cheat;not null"`
	TargetKcal       int       `gorm:"column:target_kcal;not null"`
	TargetCarbs      int       `gorm:"column:target_carbs;not null"`
	TargetProtein    int       `gorm:"column:target_protein;not null"`
	TargetFat        int       `gorm:"column:target_fat;not null"`
	GymEnabled       bool      `gorm:"column:gym_enabled;not null"`
	GymArriveBy      string    `gorm:"column:gym_arrive_by;size:5;not null"`
	GymName          string    `gorm:"column:gym_name;not null"`
	GymAddress       string    `gorm:"column:gym_address;not null"`
	GymRadiusM       int       `gorm:"column:gym_radius_m;not null"`
	SleepEnabled     bool      `gorm:"column:sleep_enabled;not null"`
	BedTime          string    `gorm:"column:bed_time;size:5;not null"`
	WakeTime         string    `gorm:"column:wake_time;size:5;not null"`
	UpdatedAt        time.Time `gorm:"column:updated_at;not null"`
}

func (legacySettingsRow) TableName() string { return "user_settings" }

func TestMigrateUpgradesSettingsBeforeNutrition(t *testing.T) {
	db, err := platform.OpenDB("sqlite", filepath.Join(t.TempDir(), "old.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&platform.User{}, &legacySettingsRow{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&platform.User{ID: "u-old", CreatedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	old := legacySettingsRow{UserID: "u-old", Mode: "normal", Goal: "gain", HeightCm: 180, WeightKg: 80, LockMinutes: 120,
		EmergencyPerWeek: 2, CouponRest: 2, CouponCheat: 2, TargetKcal: 2800, TargetCarbs: 350, TargetProtein: 144,
		TargetFat: 78, GymEnabled: true, GymArriveBy: "19:00", GymRadiusM: 150, SleepEnabled: true, BedTime: "23:30",
		WakeTime: "07:00", UpdatedAt: time.Now()}
	if err := db.Create(&old).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`UPDATE user_settings SET goal = 'bulk'`).Error; err == nil {
		t.Fatal("old check should reject bulk (test setup)")
	}
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	if db.Migrator().HasConstraint(&settings.Row{}, "ck_user_settings_goal") {
		t.Fatal("old goal check still there")
	}
	svc := settings.NewService(db, platform.Clock{Loc: time.UTC})
	cur, err := svc.Current("u-old")
	if err != nil {
		t.Fatal(err)
	}
	// existing targets and goal survive; new fields are unknown
	if cur.Goal != settings.GoalGain || cur.Targets.Kcal != 2800 || cur.Sex.Val != nil || cur.Age.Val != nil || cur.Activity.Val != nil {
		t.Fatalf("after upgrade: %+v", cur)
	}
	cur.Goal = settings.GoalBulk
	cur.Meals = []settings.MealSlot{{Index: 1, Deadline: "08:00"}, {Index: 2, Deadline: "13:00"}, {Index: 3, Deadline: "19:00"}}
	if _, err := svc.Backup("u-old", cur); err != nil {
		t.Fatalf("bulk after upgrade: %v", err)
	}
	if err := db.Exec(`UPDATE user_settings SET goal = 'gym'`).Error; err == nil {
		t.Fatal("new goal check missing")
	}
	if err := Migrate(db); err != nil { // idempotent
		t.Fatal(err)
	}
	again, _ := svc.Current("u-old")
	if again.Goal != settings.GoalBulk || again.Targets.Kcal != 2800 {
		t.Fatalf("after second migrate: %+v", again)
	}
}

// newAppBulk is what a current app saves after applying "bulk + training + keto": goal, final targets, the
// calculation inputs (with fields the server does not interpret) and the history from the first change.
func newAppBulk(t *testing.T) map[string]any {
	s := parse(t, contract(t, "settings.json"))
	s["goal"] = "bulk"
	s["targets"] = map[string]any{"kcal": 3050, "carbs": 50, "protein": 126, "fat": 284}
	s["nutrition"] = map[string]any{
		"formula": "kdri2025-eer-adult", "policy": "fitdoing-2026.10", "goalAdjustPct": 15,
		"plan": map[string]any{"mode": "training", "proteinPerKg": 1.8, "fatPct": 25,
			"carb": map[string]any{"kind": "keto", "by": "grams", "value": 50}},
		"eligibility": map[string]any{"pregnant": false, "lactating": false, "medicalDiet": false},
		"appliedOn":   "2026-10-08",
	}
	s["targetHistory"] = []any{
		map[string]any{"from": "2000-01-01", "kcal": 2100, "carbs": 283, "protein": 112, "fat": 58},
		map[string]any{"from": "2026-10-08", "kcal": 3050, "carbs": 50, "protein": 126, "fat": 284},
	}
	return s
}

// An older app keeps a stale copy (goal falls back to keep, targets are what it had before) and sends the whole
// settings whenever anything changes. That save must not wipe bulk, the advanced inputs or the applied targets.
func TestOlderAppSaveKeepsBulkAndAdvancedTargets(t *testing.T) {
	for _, path := range []string{"/api/sync/settings", "/api/settings"} {
		t.Run(path, func(t *testing.T) {
			e := newEnv(t)
			e.put("/api/sync/settings", js(newAppBulk(t))).is(t, 200)
			old := oldAppBody(t)
			old["goal"] = "keep" // the older app's fallback for an unknown goal
			old["targets"] = map[string]any{"kcal": 2100, "carbs": 283, "protein": 112, "fat": 58}
			old["nickname"] = "구버전"
			e.put(path, js(old)).is(t, 200)
			for _, r := range []resp{e.get("/api/settings").is(t, 200)} {
				r.eq(t, "settings.nickname", "구버전") // the older app's own change is kept
				r.eq(t, "settings.goal", "bulk")
				r.eq(t, "settings.targets.kcal", float64(3050))
				r.eq(t, "settings.targets.fat", float64(284))
				r.eq(t, "settings.nutrition.plan.carb.kind", "keto")
				r.eq(t, "settings.nutrition.plan.carb.value", float64(50))
				r.eq(t, "settings.nutrition.goalAdjustPct", float64(15))
				r.size(t, "settings.targetHistory", 2)
			}
			// the restore path (snapshot) returns the same inputs
			snap := e.get("/api/sync/snapshot").is(t, 200)
			snap.eq(t, "settings.goal", "bulk")
			snap.eq(t, "settings.nutrition.plan.mode", "training")
			snap.eq(t, "settings.nutrition.plan.carb.kind", "keto")
		})
	}
}

// Deliberate changes in an older app still go through: another goal, or targets never applied before.
func TestOlderAppDeliberateChangesAccepted(t *testing.T) {
	e := newEnv(t)
	e.put("/api/sync/settings", js(newAppBulk(t))).is(t, 200)
	old := oldAppBody(t)
	old["goal"] = "lose"
	old["targets"] = map[string]any{"kcal": 2400, "carbs": 260, "protein": 150, "fat": 85}
	r := e.put("/api/sync/settings", js(old)).is(t, 200)
	r.eq(t, "settings.goal", "lose")
	r.eq(t, "settings.targets.kcal", float64(2400))
	r.size(t, "settings.targetHistory", 3)
	// the inputs of the last calculation stay (targets win; the app shows the difference before the next apply)
	r.eq(t, "settings.nutrition.plan.carb.kind", "keto")
}

// A current app may set any goal, including keep after bulk.
func TestCurrentAppCanLeaveBulk(t *testing.T) {
	e := newEnv(t)
	e.put("/api/sync/settings", js(newAppBulk(t))).is(t, 200)
	s := newAppBulk(t)
	s["goal"] = "keep"
	e.put("/api/sync/settings", js(s)).is(t, 200).eq(t, "settings.goal", "keep")
}

// The recommend API only calculates; it never touches stored settings.
func TestRecommendDoesNotTouchSettings(t *testing.T) {
	e := newEnv(t)
	e.put("/api/sync/settings", js(newAppBulk(t))).is(t, 200)
	e.do("GET", "/api/targets/recommend?goal=keep&weightKg=70&heightCm=172&age=40&sex=male&activity=low", "", "").is(t, 200)
	r := e.get("/api/settings").is(t, 200)
	r.eq(t, "settings.targets.kcal", float64(3050))
	r.eq(t, "settings.nutrition.plan.carb.kind", "keto")
}

// The 1200 kcal floor limits which targets the app helps set; it never blocks logging meals. Settings backed up
// with a lower target (older data, or set elsewhere) still log, show today and the weekly graph.
func TestTargetFloorNeverBlocksLogging(t *testing.T) {
	e := newEnv(t)
	s := parse(t, contract(t, "settings.json"))
	s["targets"] = map[string]any{"kcal": 1000, "carbs": 100, "protein": 60, "fat": 40}
	s["targetHistory"] = []any{}
	e.put("/api/sync/settings", js(s)).is(t, 200).eq(t, "settings.targets.kcal", float64(1000))
	e.post("/api/meals", mealBody("2026-09-26", 1, 1, 1500, false)).is(t, 200) // over the target too
	e.get("/api/today?date=2026-09-26").is(t, 200).eq(t, "targets.kcal", 1000)
	e.get("/api/stats/weekly?date=2026-09-26").is(t, 200)
}
