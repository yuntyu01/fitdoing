// Package stats builds the home (today), monthly calendar and day-card views.
package stats

import (
	"github.com/yuntyu01/fitdoing/server/internal/coupon"
	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"gorm.io/gorm"
	"math"
)

// Row is one line of the meal table. A meal still to come carries its target instead of nutrition: what is left of
// the day's targets, shared equally by the meals still to come. A missed meal (deadline passed, nothing logged) has
// neither.
type Row struct {
	Index     int               `json:"index"`
	Deadline  string            `json:"deadline"`
	Logged    bool              `json:"logged"`
	Missed    bool              `json:"missed"`
	Nutrition *meal.Nutrition   `json:"nutrition"`
	Target    *settings.Targets `json:"target"`
}

type GymWeek struct {
	Enabled        bool   `json:"enabled"`
	Done           int    `json:"done"`
	Planned        int    `json:"planned"` // weekly target (gym.weeklyTarget, defaults to the number of gym days)
	ScheduledToday bool   `json:"scheduledToday"`
	ArriveBy       string `json:"arriveBy"`
}

type Today struct {
	Date        platform.Date    `json:"date"`
	Streak      int              `json:"streak"`
	LoggedCount int              `json:"loggedCount"`
	MealCount   int              `json:"mealCount"`
	Total       meal.Nutrition   `json:"total"`
	Targets     settings.Targets `json:"targets"`
	Rows        []Row            `json:"rows"`
	Gym         GymWeek          `json:"gym"`
	Coupons     coupon.Summary   `json:"coupons"`
}

type Day struct {
	Date        platform.Date `json:"date"`
	State       string        `json:"state"` // full | partial | none
	LoggedMeals int           `json:"loggedMeals"`
	Locked      bool          `json:"locked"`
	Gym         bool          `json:"gym"`
	SleepLocked bool          `json:"sleepLocked"`
}

type MonthSummary struct {
	FullDays   int `json:"fullDays"`
	LockedDays int `json:"lockedDays"`
	GymDays    int `json:"gymDays"`
}

type Month struct {
	Month     string       `json:"month"`
	MealCount int          `json:"mealCount"`
	Summary   MonthSummary `json:"summary"`
	Days      []Day        `json:"days"`
}

type DayCard struct {
	Date          platform.Date    `json:"date"`
	Total         meal.Nutrition   `json:"total"`
	Targets       settings.Targets `json:"targets"`
	Meals         []meal.View      `json:"meals"`
	Gym           bool             `json:"gym"`
	GymVerifiedBy *gym.Verified    `json:"gymVerifiedBy"`
	Locked        bool             `json:"locked"`
	LockCount     int              `json:"lockCount"`
}

type Service struct {
	db       *gorm.DB
	settings *settings.Service
	coupons  *coupon.Service
	meals    *meal.Service
}

func NewService(db *gorm.DB, st *settings.Service, c *coupon.Service, m *meal.Service) *Service {
	return &Service{db, st, c, m}
}

// Today builds the home view of date. now is the device's local time "HH:mm" on that date ("" = unknown: no meal
// counts as missed); meals whose deadline is at or before it and that have no log are missed.
func (s *Service) Today(userID string, date platform.Date, now string) (Today, error) {
	st, err := s.settings.Current(userID)
	if err != nil {
		return Today{}, err
	}
	var ms []meal.Log
	if err := s.db.Where("user_id = ? AND meal_date = ?", userID, date).Find(&ms).Error; err != nil {
		return Today{}, err
	}
	logged := map[int]meal.Log{}
	for _, m := range ms {
		logged[m.Index] = m
	}
	rows := []Row{}
	total := meal.Nutrition{}
	ahead := 0
	for _, slot := range st.Meals {
		m, ok := logged[slot.Index]
		switch {
		case ok:
			n := meal.NutritionOf(m)
			total = total.Plus(n)
			rows = append(rows, Row{Index: slot.Index, Deadline: slot.Deadline, Logged: true, Nutrition: &n})
		case now != "" && slot.Deadline <= now: // both "HH:mm"
			rows = append(rows, Row{Index: slot.Index, Deadline: slot.Deadline, Missed: true})
		default:
			ahead++
			rows = append(rows, Row{Index: slot.Index, Deadline: slot.Deadline})
		}
	}
	targets := st.TargetsOn(date)
	left := remainingPerMeal(targets, total, ahead)
	for i := range rows {
		if !rows[i].Logged && !rows[i].Missed {
			t := left
			rows[i].Target = &t
		}
	}
	streak, err := s.streak(userID, date)
	if err != nil {
		return Today{}, err
	}
	gymWeek, err := s.gymWeek(userID, st, date)
	if err != nil {
		return Today{}, err
	}
	sum, err := s.coupons.Summary(userID, date)
	if err != nil {
		return Today{}, err
	}
	return Today{date, streak, len(logged), len(st.Meals), total, targets, rows, gymWeek, sum}, nil
}

// streak counts consecutive logged days; with nothing logged today it counts back from yesterday.
func (s *Service) streak(userID string, date platform.Date) (int, error) {
	var days []platform.Date
	err := s.db.Model(&meal.Log{}).Where("user_id = ? AND meal_date <= ?", userID, date).
		Distinct().Order("meal_date DESC").Pluck("meal_date", &days).Error
	if err != nil {
		return 0, err
	}
	set := map[platform.Date]bool{}
	for _, d := range days {
		set[d] = true
	}
	d := date
	if !set[d] {
		d = date.AddDays(-1)
	}
	n := 0
	for set[d] {
		n++
		d = d.AddDays(-1)
	}
	return n, nil
}

func (s *Service) gymWeek(userID string, st settings.Settings, date platform.Date) (GymWeek, error) {
	mon := date.Monday()
	var done int64
	err := s.db.Model(&gym.Log{}).
		Where("user_id = ? AND gym_date BETWEEN ? AND ? AND verified_by <> ?", userID, mon, mon.AddDays(6), gym.Rest).
		Count(&done).Error // rest days do not count as visits
	if err != nil {
		return GymWeek{}, err
	}
	scheduled := false
	for _, d := range st.Gym.Days {
		if d == date.Weekday0() {
			scheduled = true
		}
	}
	return GymWeek{st.Gym.Enabled, int(done), st.Gym.WeeklyTarget, scheduled, st.Gym.ArriveBy}, nil
}

func (s *Service) Month(userID, month string) (Month, error) {
	from, to, err := platform.ParseMonth(month)
	if err != nil {
		return Month{}, platform.Invalid("month", "YYYY-MM 형식이어야 해요")
	}
	st, err := s.settings.Current(userID)
	if err != nil {
		return Month{}, err
	}
	var perDayRows []struct {
		Date platform.Date
		N    int
	}
	if err := s.db.Model(&meal.Log{}).Select("meal_date AS date, COUNT(*) AS n").
		Where("user_id = ? AND meal_date BETWEEN ? AND ?", userID, from, to).
		Group("meal_date").Scan(&perDayRows).Error; err != nil {
		return Month{}, err
	}
	perDay := map[platform.Date]int{}
	for _, r := range perDayRows {
		perDay[r.Date] = r.N
	}
	set := func(model any, col string, extra string) (map[platform.Date]bool, error) {
		var ds []platform.Date
		q := s.db.Model(model).Where("user_id = ? AND "+col+" BETWEEN ? AND ?", userID, from, to)
		if extra != "" {
			q = q.Where(extra)
		}
		if err := q.Distinct().Pluck(col, &ds).Error; err != nil {
			return nil, err
		}
		m := map[platform.Date]bool{}
		for _, d := range ds {
			m[d] = true
		}
		return m, nil
	}
	gymDays, err := set(&gym.Log{}, "gym_date", "verified_by <> 'rest'")
	if err != nil {
		return Month{}, err
	}
	lockDays, err := set(&lock.Event{}, "lock_date", "")
	if err != nil {
		return Month{}, err
	}
	sleepDays, err := set(&gym.SleepLog{}, "sleep_date", "locked_at IS NOT NULL")
	if err != nil {
		return Month{}, err
	}
	mealCount := len(st.Meals)
	days := []Day{}
	full := 0
	for d := from; d <= to; d = d.AddDays(1) {
		n := perDay[d]
		state := "none"
		switch {
		case n >= mealCount:
			state = "full"
			full++
		case n > 0:
			state = "partial"
		}
		days = append(days, Day{d, state, n, lockDays[d], gymDays[d], sleepDays[d]})
	}
	return Month{month, mealCount, MonthSummary{full, len(lockDays), len(gymDays)}, days}, nil
}

func (s *Service) Day(userID string, date platform.Date) (DayCard, error) {
	st, err := s.settings.Current(userID)
	if err != nil {
		return DayCard{}, err
	}
	list, err := s.meals.ByDate(userID, date)
	if err != nil {
		return DayCard{}, err
	}
	total := meal.Nutrition{}
	for _, m := range list {
		total = total.Plus(m.Nutrition)
	}
	var g []gym.Log
	if err := s.db.Where("user_id = ? AND gym_date = ?", userID, date).Limit(1).Find(&g).Error; err != nil {
		return DayCard{}, err
	}
	var locks int64
	if err := s.db.Model(&lock.Event{}).Where("user_id = ? AND lock_date = ?", userID, date).Count(&locks).Error; err != nil {
		return DayCard{}, err
	}
	card := DayCard{Date: date, Total: total, Targets: st.TargetsOn(date), Meals: list, Locked: locks > 0, LockCount: int(locks)}
	if len(g) > 0 {
		v := g[0].VerifiedBy
		card.GymVerifiedBy = &v
		card.Gym = v != gym.Rest
	}
	return card, nil
}

// WeekDay is one weekday of the weekly graph. State: done (logged past day), today (in progress),
// missing (past day with no record) or future. Going over the target is never flagged.
type WeekDay struct {
	Index   int             `json:"index"` // 0 = Monday
	Date    platform.Date   `json:"date"`
	State   string          `json:"state"`
	Current *meal.Nutrition `json:"current"`
	Last    *meal.Nutrition `json:"last"` // same weekday last week, null when nothing was logged
}

// Weekly is the data behind the home weekly graph: this week next to last week, per weekday, for every metric.
type Weekly struct {
	WeekStart platform.Date    `json:"weekStart"`
	Days      []WeekDay        `json:"days"`
	Avg       *meal.Nutrition  `json:"avg"`     // this week, logged past days (today excluded)
	LastAvg   *meal.Nutrition  `json:"lastAvg"` // last week, logged days
	Targets   settings.Targets `json:"targets"`
	BandPct   int              `json:"bandPct"` // goal range, +-10%
	// Summary per metric (kcal, carbs, protein, fat): the line under the graph. Same as the app's weeklySummary.
	Summary map[string]WeekSummary `json:"summary"`
}

// WeekSummary: done past days (today excluded), how many were within the goal range, and the done day furthest
// outside it (diff = value - target, negative when short), null when every done day was within.
type WeekSummary struct {
	Completed int       `json:"completed"`
	Achieved  int       `json:"achieved"`
	Furthest  *Furthest `json:"furthest"`
}

type Furthest struct {
	Index int `json:"index"` // 0 = Monday
	Diff  int `json:"diff"`
}

// weekSummary judges each done day against the target of that day (targetOn), so changing targets later
// does not change past days.
func weekSummary(days []WeekDay, targetOn func(platform.Date) int, pick func(meal.Nutrition) int) WeekSummary {
	out := WeekSummary{}
	for _, d := range days {
		if d.State != "done" || d.Current == nil {
			continue
		}
		target := targetOn(d.Date)
		lo := float64(target) * (1 - weeklyBandPct/100.0)
		hi := float64(target) * (1 + weeklyBandPct/100.0)
		out.Completed++
		v := pick(*d.Current)
		if float64(v) >= lo && float64(v) <= hi {
			out.Achieved++
			continue
		}
		diff := v - target
		if out.Furthest == nil || abs(diff) > abs(out.Furthest.Diff) {
			out.Furthest = &Furthest{Index: d.Index, Diff: diff}
		}
	}
	return out
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

const weeklyBandPct = 10

func meanNutrition(ns []meal.Nutrition) *meal.Nutrition {
	if len(ns) == 0 {
		return nil
	}
	var t meal.Nutrition
	for _, n := range ns {
		t = t.Plus(n)
	}
	c := len(ns)
	avg := func(x int) int { return int(math.Floor(float64(x)/float64(c) + 0.5)) }
	return &meal.Nutrition{Kcal: avg(t.Kcal), Carbs: avg(t.Carbs), Protein: avg(t.Protein), Fat: avg(t.Fat)}
}

func (s *Service) Weekly(userID string, date platform.Date) (Weekly, error) {
	st, err := s.settings.Current(userID)
	if err != nil {
		return Weekly{}, err
	}
	mon := date.Monday()
	var ms []meal.Log
	if err := s.db.Where("user_id = ? AND meal_date BETWEEN ? AND ?", userID, mon.AddDays(-7), mon.AddDays(6)).
		Find(&ms).Error; err != nil {
		return Weekly{}, err
	}
	perDay := map[platform.Date]meal.Nutrition{}
	for _, m := range ms {
		perDay[m.Date] = perDay[m.Date].Plus(meal.NutritionOf(m))
	}
	logged := func(d platform.Date) *meal.Nutrition {
		if n, ok := perDay[d]; ok && n.Kcal+n.Carbs+n.Protein+n.Fat > 0 {
			return &n
		}
		return nil
	}
	days := []WeekDay{}
	var thisDone, lastAll []meal.Nutrition
	for i := 0; i < 7; i++ {
		d := mon.AddDays(i)
		wd := WeekDay{Index: i, Date: d, Last: logged(mon.AddDays(i - 7))}
		cur := logged(d)
		switch {
		case d > date:
			wd.State = "future"
		case d == date:
			wd.State = "today"
			if cur == nil {
				cur = &meal.Nutrition{}
			}
			wd.Current = cur
		case cur != nil:
			wd.State = "done"
			wd.Current = cur
			thisDone = append(thisDone, *cur)
		default:
			wd.State = "missing"
		}
		if wd.Last != nil {
			lastAll = append(lastAll, *wd.Last)
		}
		days = append(days, wd)
	}
	t := st.TargetsOn(date)
	on := func(pick func(settings.Targets) int) func(platform.Date) int {
		return func(d platform.Date) int { return pick(st.TargetsOn(d)) }
	}
	summary := map[string]WeekSummary{
		"kcal":    weekSummary(days, on(func(t settings.Targets) int { return t.Kcal }), func(n meal.Nutrition) int { return n.Kcal }),
		"carbs":   weekSummary(days, on(func(t settings.Targets) int { return t.Carbs }), func(n meal.Nutrition) int { return n.Carbs }),
		"protein": weekSummary(days, on(func(t settings.Targets) int { return t.Protein }), func(n meal.Nutrition) int { return n.Protein }),
		"fat":     weekSummary(days, on(func(t settings.Targets) int { return t.Fat }), func(n meal.Nutrition) int { return n.Fat }),
	}
	return Weekly{mon, days, meanNutrition(thisDone), meanNutrition(lastAll), t, weeklyBandPct, summary}, nil
}

// remainingPerMeal is what is left of the day's targets after eaten, shared equally by n meals (0 once exceeded).
// Same calculation as the app's remainingPerMeal (domain/targets.ts).
func remainingPerMeal(t settings.Targets, eaten meal.Nutrition, n int) settings.Targets {
	d := float64(max(1, n))
	f := func(target, got int) int { return max(0, int(math.Floor(float64(target-got)/d+0.5))) }
	return settings.Targets{
		Kcal: f(t.Kcal, eaten.Kcal), Carbs: f(t.Carbs, eaten.Carbs),
		Protein: f(t.Protein, eaten.Protein), Fat: f(t.Fat, eaten.Fat),
	}
}
