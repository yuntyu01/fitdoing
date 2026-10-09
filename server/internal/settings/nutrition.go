package settings

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// Nutrition targets. The app computes and applies them (app/src/domain/nutrition.ts); the server stores the
// inputs as given, keeps targets per date, and offers the same calculation on GET /api/targets/recommend.
// Sources and app choices: docs/nutrition-targets.md.

// FormulaVersion: 2025 KDRI adult (19+) estimated energy requirement equation and PA coefficients.
const FormulaVersion = "kdri2025-eer-adult"

// PolicyVersion: the app's own starting values (goal adjustment, macro split, 50 kcal rounding, 1200 kcal floor).
const PolicyVersion = "fitdoing-2026.10"

type Sex string

const (
	SexMale   Sex = "male"
	SexFemale Sex = "female"
)

func (x *Sex) UnmarshalJSON(b []byte) error {
	s, err := platform.EnumJSON(b, "male", "female")
	*x = Sex(s)
	return err
}

// Activity is the KDRI physical activity level. Values are matched exactly (EnumJSON lower-cases).
type Activity string

const (
	ActivitySedentary  Activity = "sedentary"
	ActivityLow        Activity = "low"
	ActivityActive     Activity = "active"
	ActivityVeryActive Activity = "veryActive"
)

func ParseActivity(s string) (Activity, bool) {
	switch a := Activity(s); a {
	case ActivitySedentary, ActivityLow, ActivityActive, ActivityVeryActive:
		return a, true
	}
	return "", false
}

func (a *Activity) UnmarshalJSON(b []byte) error {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	if s == nil {
		*a = ""
		return nil
	}
	v, ok := ParseActivity(*s)
	if !ok {
		return fmt.Errorf("invalid activity %q", *s)
	}
	*a = v
	return nil
}

// paCoef is table 2 of the 2025 KDRI (adults).
var paCoef = map[Sex]map[Activity]float64{
	SexMale:   {ActivitySedentary: 1.0, ActivityLow: 1.11, ActivityActive: 1.25, ActivityVeryActive: 1.48},
	SexFemale: {ActivitySedentary: 1.0, ActivityLow: 1.12, ActivityActive: 1.27, ActivityVeryActive: 1.45},
}

// AdultAge is the age the adult equation starts at; the app accepts AgeMin..AgeMax as input.
const (
	AdultAge = 19
	AgeMin   = 10
	AgeMax   = 100
)

type Body struct {
	Sex      Sex
	Age      int
	Activity Activity
	HeightCm float64
	WeightKg float64
}

// EER is the adult estimated energy requirement (kcal/day), not rounded. Height is converted from cm to m.
func EER(b Body) float64 {
	m := b.HeightCm / 100
	pa := paCoef[b.Sex][b.Activity]
	age := float64(b.Age)
	if b.Sex == SexMale {
		return 662 - 9.53*age + pa*(15.91*b.WeightKg+539.6*m)
	}
	return 354 - 6.91*age + pa*(9.36*b.WeightKg+726*m)
}

// goalAdjustStart is the app's starting adjustment (%) per goal. App policy, not a KDRI value.
func goalAdjustStart(g Goal) float64 {
	switch g {
	case GoalLose:
		return -20
	case GoalGain:
		return 10
	case GoalBulk:
		return 20
	}
	return 0
}

// proteinPerKgStart is the app's starting protein (g/kg) for the training mode.
func proteinPerKgStart(g Goal) float64 {
	switch g {
	case GoalLose:
		return 2.0
	case GoalGain, GoalBulk:
		return 1.8
	}
	return 1.6
}

// Recommendation is the answer of the EER-based recommend API: the maintenance estimate and the target are
// separate, and the target split uses the app's starting values for the mode.
type Recommendation struct {
	Targets
	Maintenance   float64 `json:"maintenanceKcal"`
	AdjustPct     float64 `json:"goalAdjustPct"`
	Mode          string  `json:"mode"`
	Formula       string  `json:"formula"`
	Policy        string  `json:"policy"`
	ProteinPerKg  float64 `json:"proteinPerKg"`
	PercentCarbs  float64 `json:"carbsPct"`
	PercentProt   float64 `json:"proteinPct"`
	PercentFat    float64 `json:"fatPct"`
	RoundedToKcal int     `json:"roundedTo"`
}

// RecommendEER: maintenance x (1 + adjustment), rounded once to 50 kcal, then split with that final kcal.
// mode "balanced": 55/20/25 % of kcal. mode "training": protein = weight x g/kg, fat 25 %, carbs the rest.
// Grams are rounded only at the end. A negative remainder or a target under MinKcal is an error, never clamped.
func RecommendEER(goal Goal, b Body, mode string) (Recommendation, error) {
	if b.Age < AdultAge {
		return Recommendation{}, platform.BadRequest("ADULT_ONLY", "일반 자동 계산은 19세 이상 성인만 쓸 수 있어요")
	}
	maint := EER(b)
	adj := goalAdjustStart(goal)
	kcal := float64(round(maint*(1+adj/100)/50) * 50)
	if kcal < MinKcal {
		return Recommendation{}, platform.BadRequest("TARGET_BELOW_MINIMUM",
			fmt.Sprintf("자동 추천 결과가 앱의 목표 범위(%dkcal 이상)보다 낮아요. 조정률을 줄이거나 전문가와 목표를 정하세요", MinKcal))
	}
	var c, p, f float64
	switch mode {
	case "", "balanced":
		mode = "balanced"
		c, p, f = kcal*0.55/4, kcal*0.20/4, kcal*0.25/9
	case "training":
		p = b.WeightKg * proteinPerKgStart(goal)
		f = kcal * 0.25 / 9
		c = (kcal - p*4 - f*9) / 4
		if c < 0 {
			return Recommendation{}, platform.BadRequest("NEGATIVE_REMAINDER", "남는 칼로리가 모자라 탄수화물이 음수가 돼요")
		}
	default:
		return Recommendation{}, platform.Invalid("mode", "balanced, training 중 하나예요")
	}
	return Recommendation{
		Targets:     Targets{Kcal: int(kcal), Carbs: round(c), Protein: round(p), Fat: round(f)},
		Maintenance: maint, AdjustPct: adj, Mode: mode, Formula: FormulaVersion, Policy: PolicyVersion,
		ProteinPerKg: p / b.WeightKg, PercentCarbs: c * 400 / kcal, PercentProt: p * 400 / kcal, PercentFat: f * 900 / kcal,
		RoundedToKcal: 50,
	}, nil
}

// ── stored inputs (opaque to the server, checked for shape and size) ──────────────

const maxInputBytes = 4 << 10

func checkObject(field string, raw *json.RawMessage, check func(map[string]any) bool) error {
	if raw == nil {
		return nil
	}
	if len(*raw) > maxInputBytes {
		return platform.Invalid(field, "너무 커요")
	}
	var m map[string]any
	if err := json.Unmarshal(*raw, &m); err != nil || m == nil {
		return platform.Invalid(field, "객체여야 해요")
	}
	if check != nil && !check(m) {
		return platform.Invalid(field, "모양이 잘못됐어요")
	}
	return nil
}

func oneOfStr(v any, allowed ...string) bool {
	s, ok := v.(string)
	if !ok {
		return false
	}
	for _, a := range allowed {
		if s == a {
			return true
		}
	}
	return false
}

func validNutrition(m map[string]any) bool {
	plan, ok := m["plan"].(map[string]any)
	return ok && oneOfStr(plan["mode"], "balanced", "training", "custom")
}

func validFoodStyle(m map[string]any) bool {
	return oneOfStr(m["pattern"], "general", "vegetarian", "vegan", "mediterranean", "carnivore")
}

func validFasting(m map[string]any) bool {
	f, _ := m["eatFrom"].(string)
	t, _ := m["eatTo"].(string)
	return ValidHHMM(f) && ValidHHMM(t)
}

// ── saves from apps older than 2026-10 ─────────────────────────────────────────

// fromOlderApp: the request has no "nutrition" key. Apps from 2026-10 on always send it (null or an object).
func (s Settings) fromOlderApp() bool { return !s.Nutrition.Set }

// protectFromOlderApp keeps what an older app would overwrite without meaning to:
//   - goal "bulk": an older app doesn't know it and shows/sends its fallback "keep". A stored bulk stays when an
//     older app sends keep (it can still pick lose or gain). Switching bulk -> keep needs a current app.
//   - targets: once a current app has applied targets (nutrition inputs stored), an older app that sends targets
//     equal to an earlier entry of the history is sending its stale copy (it saves the whole settings on any
//     change, e.g. a meal time). The current targets stay. A value never applied before is a deliberate edit in
//     the older app and is accepted (recorded in the history; the stored inputs then no longer match, see docs).
func (s *Settings) protectFromOlderApp(stored Settings) {
	if stored.Goal == GoalBulk && s.Goal == GoalKeep {
		s.Goal = GoalBulk
	}
	if stored.Nutrition.Val == nil || stored.TargetHistory.Val == nil || s.Targets == nil || stored.Targets == nil {
		return
	}
	if *s.Targets == *stored.Targets {
		return
	}
	for _, e := range *stored.TargetHistory.Val {
		if e.Targets == *s.Targets {
			cur := *stored.Targets
			s.Targets = &cur
			return
		}
	}
}

// ── targets per date ─────────────────────────────────────────────────────────

// TargetEntry: targets applied from a date (device-local YYYY-MM-DD) on.
type TargetEntry struct {
	From platform.Date `json:"from"`
	Targets
}

// HistoryStart covers every date before the first change.
const HistoryStart platform.Date = "2000-01-01"
const historyMax = 400

// TargetsOn is the target that applied on d; cur when no entry is on or before d.
func TargetsOn(h []TargetEntry, cur Targets, d platform.Date) Targets {
	var hit *TargetEntry
	for i := range h {
		if h[i].From <= d && (hit == nil || h[i].From > hit.From) {
			hit = &h[i]
		}
	}
	if hit == nil {
		return cur
	}
	return hit.Targets
}

// TargetsOn is the target of these settings on d: the history entry for that date, else the current targets.
func (s Settings) TargetsOn(d platform.Date) Targets {
	var h []TargetEntry
	if s.TargetHistory.Val != nil {
		h = *s.TargetHistory.Val
	}
	return TargetsOn(h, *s.Targets, d)
}

// recordTargets adds a change prev -> next from today on (same as the app's recordTargets). The first change
// keeps prev from HistoryStart, so past dates keep their targets. Used when an older app (no targetHistory) saves.
func recordTargets(h []TargetEntry, prev, next Targets, today platform.Date) []TargetEntry {
	if prev == next {
		return h
	}
	base := h
	if len(base) == 0 {
		base = []TargetEntry{{From: HistoryStart, Targets: prev}}
	}
	out := make([]TargetEntry, 0, len(base)+1)
	for _, e := range base {
		if e.From < today {
			out = append(out, e)
		}
	}
	out = append(out, TargetEntry{From: today, Targets: next})
	sort.Slice(out, func(i, j int) bool { return out[i].From < out[j].From })
	if len(out) > historyMax {
		out = out[len(out)-historyMax:]
	}
	return out
}

func validateHistory(h []TargetEntry) error {
	if len(h) > historyMax {
		return platform.Invalid("targetHistory", "너무 많아요")
	}
	seen := map[platform.Date]bool{}
	for _, e := range h {
		if _, err := platform.ParseDate(string(e.From)); err != nil {
			return platform.Invalid("targetHistory.from", "YYYY-MM-DD 형식이어야 해요")
		}
		if seen[e.From] {
			return platform.Invalid("targetHistory.from", "겹치면 안 돼요")
		}
		seen[e.From] = true
		if e.Kcal < 0 || e.Carbs < 0 || e.Protein < 0 || e.Fat < 0 {
			return platform.Invalid("targetHistory", "0 이상이어야 해요")
		}
	}
	return nil
}
