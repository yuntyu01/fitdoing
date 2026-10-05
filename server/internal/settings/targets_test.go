package settings

import "testing"

func TestRecommendMatchesAppDefaults(t *testing.T) {
	got := Recommend(GoalKeep, 70)
	if got.Kcal != 2100 || got.Protein != 112 {
		t.Fatalf("got %+v", got)
	}
}

func TestKcalNeverBelowFloor(t *testing.T) {
	if got := Recommend(GoalLose, 40).Kcal; got != MinKcal {
		t.Fatalf("got %d", got)
	}
}

func TestPerMealDividesTargets(t *testing.T) {
	if got := Recommend(GoalKeep, 70).PerMeal(4).Kcal; got != 525 {
		t.Fatalf("got %d", got)
	}
}
