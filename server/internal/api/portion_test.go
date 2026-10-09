package api

import "testing"

// Per-food eaten amounts: the app sends each food's portion and meal totals that already include them
// (meal portion stays 1). The server keeps both as sent, and GET /api/meals and the snapshot return them.
func TestMealPerFoodPortionsRoundTrip(t *testing.T) {
	e := newEnv(t)
	// rice 300 kcal eaten 75% (225) + chicken 200 kcal eaten 100% = 425
	body := `{"date":"2026-09-26","index":2,"deadline":"14:00","portion":1,"sharedMeal":false,"shareFriends":true,"cheat":false,
	 "ai":{"items":[
	   {"name":"현미밥","amount":"200g","kcal":300,"carbs":64,"protein":6,"fat":2,"portion":0.75},
	   {"name":"닭가슴살","amount":"100g","kcal":200,"carbs":0,"protein":40,"fat":4,"portion":1},
	   {"name":"김치","amount":"조금"}],
	 "kcal":425,"carbs":48,"protein":45,"fat":6,"confidence":0.8}}`
	r := e.post("/api/meals", body).is(t, 200)
	r.eq(t, "meal.items.0.portion", 0.75)
	r.eq(t, "meal.shareFriends", true)

	list := e.get("/api/meals?date=2026-09-26").is(t, 200)
	if len(list.List) != 1 {
		t.Fatalf("meals = %s", list.Raw)
	}
	for path, want := range map[string]any{
		"items.0.portion": 0.75,
		"items.0.kcal":    300.0, // the food itself stays the full amount
		"items.1.portion": 1.0,
		"items.2.portion": nil, // a manual food without a choice
		"nutrition.kcal":  425.0,
		"portion":         1.0,
		"shareFriends":    true,
	} {
		if got := at(t, list.List[0], path); got != want {
			t.Errorf("%s = %v, want %v (%s)", path, got, want, list.Raw)
		}
	}

	snap := e.get("/api/sync/snapshot").is(t, 200)
	snap.eq(t, "meals.0.items.0.portion", 0.75)
	snap.eq(t, "meals.0.items.1.portion", 1)
	snap.eq(t, "meals.0.items.2.portion", nil)
	snap.eq(t, "meals.0.base.kcal", 425)
	snap.eq(t, "meals.0.shareFriends", true)

	// overwriting the slot replaces the portions (edit from the day screen)
	edited := `{"date":"2026-09-26","index":2,"deadline":"14:00","portion":1,"sharedMeal":false,"shareFriends":false,"cheat":false,
	 "ai":{"items":[{"name":"현미밥","amount":"200g","kcal":300,"carbs":64,"protein":6,"fat":2,"portion":0.5}],
	 "kcal":150,"carbs":32,"protein":3,"fat":1,"confidence":0.8}}`
	e.post("/api/meals", edited).is(t, 200)
	snap = e.get("/api/sync/snapshot").is(t, 200)
	snap.size(t, "meals.0.items", 1)
	snap.eq(t, "meals.0.items.0.portion", 0.5)
	snap.eq(t, "meals.0.shareFriends", false)

	// only the six per-food steps are accepted
	bad := `{"date":"2026-09-26","index":2,"portion":1,"sharedMeal":false,"cheat":false,
	 "ai":{"items":[{"name":"밥","amount":"1공기","kcal":300,"carbs":64,"protein":6,"fat":2,"portion":0.3}],
	 "kcal":90,"carbs":19,"protein":2,"fat":1,"confidence":0.8}}`
	e.post("/api/meals", bad).code(t, 400, "INVALID")
}
