package settings

import "github.com/yuntyu01/fitdoing/server/internal/platform"

// MinKcal is the floor for the daily target (app policy).
const MinKcal = 1200

const fatRatio = 0.25

type Targets struct {
	Kcal    int `json:"kcal"`
	Carbs   int `json:"carbs"`
	Protein int `json:"protein"`
	Fat     int `json:"fat"`
}

func ClampKcal(kcal float64) int { return max(MinKcal, round(kcal)) }

// Recommend is the legacy weight-based default (before 2026-10): the placeholder target of new settings and the
// answer to legacy recommend requests. It is not derived from the user's body, see RecommendEER.
func Recommend(goal Goal, weightKg float64) Targets {
	kcal := ClampKcal(float64(round(weightKg*goal.kcalPerKg()/50.0) * 50))
	return MacrosFor(kcal, round(weightKg*goal.proteinPerKg()))
}

// MacrosFor fills fat with 25% of kcal and carbs with the remainder.
func MacrosFor(kcal, protein int) Targets {
	fat := round(float64(kcal) * fatRatio / 9)
	carbs := max(0, round((float64(kcal)-float64(protein)*4-float64(fat)*9)/4))
	return Targets{kcal, carbs, protein, fat}
}

// PerMeal is the per-meal target shown faintly on empty meal slots.
func (t Targets) PerMeal(mealCount int) Targets {
	n := float64(max(1, mealCount))
	f := func(v int) int { return round(float64(v) / n) }
	return Targets{f(t.Kcal), f(t.Carbs), f(t.Protein), f(t.Fat)}
}

// ParseGoal validates the `goal` query parameter.
func ParseGoal(s string) (Goal, error) {
	switch g := Goal(s); g {
	case GoalLose, GoalKeep, GoalGain, GoalBulk:
		return g, nil
	}
	return "", platform.BadRequest("INVALID", "goal은 lose, keep, gain, bulk 중 하나예요")
}
