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

// Row is one line of the meal table. Unlogged rows carry the per-meal target instead of nutrition.
type Row struct {
	Index     int               `json:"index"`
	Deadline  string            `json:"deadline"`
	Logged    bool              `json:"logged"`
	Nutrition *meal.Nutrition   `json:"nutrition"`
	Target    *settings.Targets `json:"target"`
}

type GymWeek struct {
	Enabled        bool   `json:"enabled"`
	Done           int    `json:"done"`
	Planned        int    `json:"planned"`
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

func (s *Service) Today(deviceID string, date platform.Date) (Today, error) {
	st, err := s.settings.Current(deviceID)
	if err != nil {
		return Today{}, err
	}
	var ms []meal.Log
	if err := s.db.Where("device_id = ? AND meal_date = ?", deviceID, date).Find(&ms).Error; err != nil {
		return Today{}, err
	}
	logged := map[int]meal.Log{}
	for _, m := range ms {
		logged[m.Index] = m
	}
	perMeal := st.Targets.PerMeal(len(st.Meals))
	rows := []Row{}
	total := meal.Nutrition{}
	for _, slot := range st.Meals {
		m, ok := logged[slot.Index]
		if !ok {
			t := perMeal
			rows = append(rows, Row{Index: slot.Index, Deadline: slot.Deadline, Target: &t})
			continue
		}
		n := meal.NutritionOf(m)
		total = total.Plus(n)
		rows = append(rows, Row{Index: slot.Index, Deadline: slot.Deadline, Logged: true, Nutrition: &n})
	}
	streak, err := s.streak(deviceID, date)
	if err != nil {
		return Today{}, err
	}
	gymWeek, err := s.gymWeek(deviceID, st, date)
	if err != nil {
		return Today{}, err
	}
	sum, err := s.coupons.Summary(deviceID, date)
	if err != nil {
		return Today{}, err
	}
	return Today{date, streak, len(logged), len(st.Meals), total, *st.Targets, rows, gymWeek, sum}, nil
}

// streak counts consecutive logged days; with nothing logged today it counts back from yesterday.
func (s *Service) streak(deviceID string, date platform.Date) (int, error) {
	var days []platform.Date
	err := s.db.Model(&meal.Log{}).Where("device_id = ? AND meal_date <= ?", deviceID, date).
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

func (s *Service) gymWeek(deviceID string, st settings.Settings, date platform.Date) (GymWeek, error) {
	mon := date.Monday()
	var done int64
	err := s.db.Model(&gym.Log{}).
		Where("device_id = ? AND gym_date BETWEEN ? AND ? AND verified_by <> ?", deviceID, mon, mon.AddDays(6), gym.Rest).
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
	return GymWeek{st.Gym.Enabled, int(done), len(st.Gym.Days), scheduled, st.Gym.ArriveBy}, nil
}

func (s *Service) Month(deviceID, month string) (Month, error) {
	from, to, err := platform.ParseMonth(month)
	if err != nil {
		return Month{}, platform.Invalid("month", "YYYY-MM 형식이어야 해요")
	}
	st, err := s.settings.Current(deviceID)
	if err != nil {
		return Month{}, err
	}
	var perDayRows []struct {
		Date platform.Date
		N    int
	}
	if err := s.db.Model(&meal.Log{}).Select("meal_date AS date, COUNT(*) AS n").
		Where("device_id = ? AND meal_date BETWEEN ? AND ?", deviceID, from, to).
		Group("meal_date").Scan(&perDayRows).Error; err != nil {
		return Month{}, err
	}
	perDay := map[platform.Date]int{}
	for _, r := range perDayRows {
		perDay[r.Date] = r.N
	}
	set := func(model any, col string, extra string) (map[platform.Date]bool, error) {
		var ds []platform.Date
		q := s.db.Model(model).Where("device_id = ? AND "+col+" BETWEEN ? AND ?", deviceID, from, to)
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

func (s *Service) Day(deviceID string, date platform.Date) (DayCard, error) {
	st, err := s.settings.Current(deviceID)
	if err != nil {
		return DayCard{}, err
	}
	list, err := s.meals.ByDate(deviceID, date)
	if err != nil {
		return DayCard{}, err
	}
	total := meal.Nutrition{}
	for _, m := range list {
		total = total.Plus(m.Nutrition)
	}
	var g []gym.Log
	if err := s.db.Where("device_id = ? AND gym_date = ?", deviceID, date).Limit(1).Find(&g).Error; err != nil {
		return DayCard{}, err
	}
	var locks int64
	if err := s.db.Model(&lock.Event{}).Where("device_id = ? AND lock_date = ?", deviceID, date).Count(&locks).Error; err != nil {
		return DayCard{}, err
	}
	card := DayCard{Date: date, Total: total, Targets: *st.Targets, Meals: list, Locked: locks > 0, LockCount: int(locks)}
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

func (s *Service) Weekly(deviceID string, date platform.Date) (Weekly, error) {
	st, err := s.settings.Current(deviceID)
	if err != nil {
		return Weekly{}, err
	}
	mon := date.Monday()
	var ms []meal.Log
	if err := s.db.Where("device_id = ? AND meal_date BETWEEN ? AND ?", deviceID, mon.AddDays(-7), mon.AddDays(6)).
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
	return Weekly{mon, days, meanNutrition(thisDone), meanNutrition(lastAll), *st.Targets, weeklyBandPct}, nil
}
