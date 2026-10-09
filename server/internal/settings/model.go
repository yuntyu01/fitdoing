// Package settings holds the per-user settings backup, goals and targets.
package settings

import (
	"encoding/json"
	"math"
	"regexp"
	"slices"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// Mode is the strictness level. Lowering it only takes effect from next Monday.
type Mode string

const (
	ModeMild   Mode = "mild"
	ModeNormal Mode = "normal"
	ModeSpicy  Mode = "spicy"
)

func (m Mode) rank() int {
	switch m {
	case ModeMild:
		return 0
	case ModeNormal:
		return 1
	}
	return 2
}

func (m *Mode) UnmarshalJSON(b []byte) error {
	s, err := platform.EnumJSON(b, "mild", "normal", "spicy")
	*m = Mode(s)
	return err
}

type Goal string

const (
	GoalLose Goal = "lose"
	GoalKeep Goal = "keep"
	GoalGain Goal = "gain" // lean bulk (a small surplus); the value of the old "gain" goal
	GoalBulk Goal = "bulk" // bulk (a larger surplus), added 2026-10
)

func (g *Goal) UnmarshalJSON(b []byte) error {
	s, err := platform.EnumJSON(b, "lose", "keep", "gain", "bulk")
	*g = Goal(s)
	return err
}

func (g Goal) kcalPerKg() float64 {
	switch g {
	case GoalLose:
		return 25
	case GoalGain, GoalBulk:
		return 35
	}
	return 30
}

func (g Goal) proteinPerKg() float64 {
	switch g {
	case GoalLose:
		return 2.0
	case GoalGain, GoalBulk:
		return 1.8
	}
	return 1.6
}

// round is Java's Math.round for the positive values used here.
func round(x float64) int { return int(math.Floor(x + 0.5)) }

type MealSlot struct {
	Index    int    `json:"index"`
	Deadline string `json:"deadline"`
}

type Gym struct {
	Enabled bool  `json:"enabled"`
	Days    []int `json:"days"` // 0=Mon ... 6=Sun
	// WeeklyTarget is how many check-ins a week count as done (1~7). 0 or absent = the number of gym days.
	WeeklyTarget int      `json:"weeklyTarget"`
	ArriveBy     string   `json:"arriveBy"`
	Name         *string  `json:"name"`
	Address      *string  `json:"address"`
	Lat          *float64 `json:"lat"`
	Lng          *float64 `json:"lng"`
	RadiusM      int      `json:"radiusM"`
}

type Sleep struct {
	Enabled  bool   `json:"enabled"`
	BedTime  string `json:"bedTime"`
	WakeTime string `json:"wakeTime"`
}

type Coupons struct {
	Rest  int `json:"rest"`
	Cheat int `json:"cheat"`
}

// Settings has the same shape as the app's Settings type; it is the server-side backup.
type Settings struct {
	Mode             Mode       `json:"mode"`
	Goal             Goal       `json:"goal"`
	HeightCm         int        `json:"heightCm"`
	WeightKg         float64    `json:"weightKg"`
	Meals            []MealSlot `json:"meals"`
	Gym              *Gym       `json:"gym"`
	Sleep            *Sleep     `json:"sleep"`
	Coupons          *Coupons   `json:"coupons"`
	Targets          *Targets   `json:"targets"`
	AllowedApps      []string   `json:"allowedApps"`
	LockMinutes      int        `json:"lockMinutes"`
	EmergencyPerWeek int        `json:"emergencyPerWeek"`
	PhotoBackup      bool       `json:"photoBackup"`
	// Added 2026-10: absent in older apps, so each has a default (see Normalize).
	Nickname      string `json:"nickname"`      // shown to friends, up to 20 characters
	ThemeMode     string `json:"themeMode"`     // system | light | dark
	Notifications *bool  `json:"notifications"` // deadline reminders on/off (absent = on)
	ShareFriends  bool   `json:"shareFriends"`  // new meals are shared with friends by default

	// Added 2026-10 (nutrition targets). Opt: an older app leaves them out and the stored value is kept;
	// null means "unknown" (never filled with a guessed default).
	Sex           Opt[Sex]             `json:"sex"`
	Age           Opt[int]             `json:"age"`
	Activity      Opt[Activity]        `json:"activity"`
	ActivityInput Opt[json.RawMessage] `json:"activityInput"` // daily activity and exercise the user described
	Nutrition     Opt[json.RawMessage] `json:"nutrition"`     // calculation inputs (mode, ratios, versions); targets are the result
	TargetHistory Opt[[]TargetEntry]   `json:"targetHistory"` // targets per date
	FoodStyle     Opt[json.RawMessage] `json:"foodStyle"`     // food choice (vegetarian, ...), stored only
	Allergies     Opt[[]string]        `json:"allergies"`     // separate from food style, stored only
	Fasting       Opt[json.RawMessage] `json:"fasting"`       // eating window (structure only)
}

// Merge keeps the stored value of every newer field the request left out (an older app's save).
func (s *Settings) Merge(stored Settings) {
	s.Sex = s.Sex.or(stored.Sex)
	s.Age = s.Age.or(stored.Age)
	s.Activity = s.Activity.or(stored.Activity)
	s.ActivityInput = s.ActivityInput.or(stored.ActivityInput)
	s.Nutrition = s.Nutrition.or(stored.Nutrition)
	s.FoodStyle = s.FoodStyle.or(stored.FoodStyle)
	s.Allergies = s.Allergies.or(stored.Allergies)
	s.Fasting = s.Fasting.or(stored.Fasting)
}

// ThemeModes are the allowed themeMode values.
var ThemeModes = []string{"system", "light", "dark"}

// Normalize fills the defaults of the fields older apps don't send.
func (s *Settings) Normalize() {
	if s.ThemeMode == "" {
		s.ThemeMode = "system"
	}
	if s.Notifications == nil {
		s.Notifications = ptr(true)
	}
	if s.Gym != nil && s.Gym.WeeklyTarget == 0 {
		s.Gym.WeeklyTarget = len(s.Gym.Days)
	}
}

func ptr[T any](v T) *T { return &v }

func Defaults() Settings {
	t := Recommend(GoalKeep, 70)
	return Settings{
		Mode: ModeNormal, Goal: GoalKeep, HeightCm: 175, WeightKg: 70,
		Meals: []MealSlot{{1, "08:00"}, {2, "14:00"}, {3, "17:00"}, {4, "19:00"}},
		Gym: &Gym{Enabled: true, Days: []int{0, 1, 2, 3, 4}, ArriveBy: "19:00",
			Name: ptr(""), Address: ptr(""), RadiusM: 150},
		Sleep:   &Sleep{Enabled: true, BedTime: "23:30", WakeTime: "07:00"},
		Coupons: &Coupons{Rest: 2, Cheat: 2}, Targets: &t,
		AllowedApps: []string{}, LockMinutes: 120, EmergencyPerWeek: 2,
		ThemeMode: "system", Notifications: ptr(true),
	}
}

var hhmm = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// ValidHHMM reports whether s is a 24h "HH:mm" time.
func ValidHHMM(s string) bool { return hhmm.MatchString(s) }

func between(v, lo, hi int) bool { return v >= lo && v <= hi }

// Validate applies the field constraints (400 INVALID, first failure wins).
func (s *Settings) Validate() error {
	switch {
	case s.Mode == "":
		return platform.Invalid("mode", "필수예요")
	case s.Goal == "":
		return platform.Invalid("goal", "필수예요")
	case !between(s.HeightCm, 100, 250):
		return platform.Invalid("heightCm", "100~250 사이여야 해요")
	case s.WeightKg < 20 || s.WeightKg > 400:
		return platform.Invalid("weightKg", "20~400 사이여야 해요")
	case len(s.Meals) < 3 || len(s.Meals) > 6:
		return platform.Invalid("meals", "3~6개여야 해요")
	case s.Gym == nil:
		return platform.Invalid("gym", "필수예요")
	case s.Sleep == nil:
		return platform.Invalid("sleep", "필수예요")
	case s.Coupons == nil:
		return platform.Invalid("coupons", "필수예요")
	case s.Targets == nil:
		return platform.Invalid("targets", "필수예요")
	case s.AllowedApps == nil:
		return platform.Invalid("allowedApps", "필수예요")
	case !between(s.LockMinutes, 10, 720):
		return platform.Invalid("lockMinutes", "10~720 사이여야 해요")
	case !between(s.EmergencyPerWeek, 0, 7):
		return platform.Invalid("emergencyPerWeek", "0~7 사이여야 해요")
	case s.Age.Val != nil && !between(*s.Age.Val, AgeMin, AgeMax):
		return platform.Invalid("age", "10~100 사이여야 해요")
	case s.Allergies.Val != nil && len(*s.Allergies.Val) > 10:
		return platform.Invalid("allergies", "10개 이하여야 해요")
	case len([]rune(s.Nickname)) > 20:
		return platform.Invalid("nickname", "20자 이하여야 해요")
	case s.ThemeMode != "" && !slices.Contains(ThemeModes, s.ThemeMode):
		return platform.Invalid("themeMode", "system, light, dark 중 하나예요")
	}
	for _, c := range []struct {
		field string
		raw   *json.RawMessage
		check func(map[string]any) bool
	}{
		{"activityInput", s.ActivityInput.Val, nil},
		{"nutrition", s.Nutrition.Val, validNutrition},
		{"foodStyle", s.FoodStyle.Val, validFoodStyle},
		{"fasting", s.Fasting.Val, validFasting},
	} {
		if err := checkObject(c.field, c.raw, c.check); err != nil {
			return err
		}
	}
	if s.Allergies.Val != nil {
		for _, a := range *s.Allergies.Val {
			if len([]rune(a)) > 30 {
				return platform.Invalid("allergies", "30자 이하여야 해요")
			}
		}
	}
	if s.TargetHistory.Val != nil {
		if err := validateHistory(*s.TargetHistory.Val); err != nil {
			return err
		}
	}
	for _, m := range s.Meals {
		if !between(m.Index, 1, 6) {
			return platform.Invalid("meals.index", "1~6 사이여야 해요")
		}
		if !ValidHHMM(m.Deadline) {
			return platform.Invalid("meals.deadline", "HH:mm 형식이어야 해요")
		}
	}
	g := s.Gym
	if g.Days == nil {
		return platform.Invalid("gym.days", "필수예요")
	}
	for _, d := range g.Days {
		if !between(d, 0, 6) {
			return platform.Invalid("gym.days", "0~6 사이여야 해요")
		}
	}
	if !between(g.WeeklyTarget, 0, 7) {
		return platform.Invalid("gym.weeklyTarget", "0~7 사이여야 해요")
	}
	switch {
	case !ValidHHMM(g.ArriveBy):
		return platform.Invalid("gym.arriveBy", "HH:mm 형식이어야 해요")
	case g.Name == nil:
		return platform.Invalid("gym.name", "필수예요")
	case g.Address == nil:
		return platform.Invalid("gym.address", "필수예요")
	case !between(g.RadiusM, 30, 1000):
		return platform.Invalid("gym.radiusM", "30~1000 사이여야 해요")
	case !ValidHHMM(s.Sleep.BedTime):
		return platform.Invalid("sleep.bedTime", "HH:mm 형식이어야 해요")
	case !ValidHHMM(s.Sleep.WakeTime):
		return platform.Invalid("sleep.wakeTime", "HH:mm 형식이어야 해요")
	case !between(s.Coupons.Rest, 0, 7):
		return platform.Invalid("coupons.rest", "0~7 사이여야 해요")
	case !between(s.Coupons.Cheat, 0, 7):
		return platform.Invalid("coupons.cheat", "0~7 사이여야 해요")
	}
	t := s.Targets
	if t.Kcal < 0 || t.Carbs < 0 || t.Protein < 0 || t.Fat < 0 {
		return platform.Invalid("targets", "0 이상이어야 해요")
	}
	return nil
}

// View is the applied settings plus a pending (lowered) mode, if any.
type View struct {
	Settings    Settings       `json:"settings"`
	PendingMode *Mode          `json:"pendingMode"`
	PendingFrom *platform.Date `json:"pendingFrom"`
}

// Row is the scalar part of the settings (table user_settings). Meal slots, gym weekdays and allowed
// apps live in their own tables (SlotRow, DayRow, AppRow); everything cascades from users.
type Row struct {
	UserID           string         `gorm:"column:user_id;primaryKey;size:64"`
	Mode             string         `gorm:"column:mode;size:8;not null;check:ck_user_settings_mode,mode IN ('mild','normal','spicy')"`
	PendingMode      *string        `gorm:"column:pending_mode;size:8;check:ck_user_settings_pending,pending_mode IN ('mild','normal','spicy')"`
	PendingFrom      *platform.Date `gorm:"column:pending_from;size:10"`
	Goal             string         `gorm:"column:goal;size:8;not null;check:ck_user_settings_goal_v2,goal IN ('lose','keep','gain','bulk')"`
	HeightCm         int            `gorm:"column:height_cm;not null"`
	WeightKg         float64        `gorm:"column:weight_kg;not null"`
	LockMinutes      int            `gorm:"column:lock_minutes;not null"`
	EmergencyPerWeek int            `gorm:"column:emergency_per_week;not null"`
	PhotoBackup      bool           `gorm:"column:photo_backup;not null"`
	CouponRest       int            `gorm:"column:coupon_rest;not null"`
	CouponCheat      int            `gorm:"column:coupon_cheat;not null"`
	TargetKcal       int            `gorm:"column:target_kcal;not null"`
	TargetCarbs      int            `gorm:"column:target_carbs;not null"`
	TargetProtein    int            `gorm:"column:target_protein;not null"`
	TargetFat        int            `gorm:"column:target_fat;not null"`
	GymEnabled       bool           `gorm:"column:gym_enabled;not null"`
	GymArriveBy      string         `gorm:"column:gym_arrive_by;size:5;not null"`
	GymName          string         `gorm:"column:gym_name;not null"`
	GymAddress       string         `gorm:"column:gym_address;not null"`
	GymLat           *float64       `gorm:"column:gym_lat"`
	GymLng           *float64       `gorm:"column:gym_lng"`
	GymRadiusM       int            `gorm:"column:gym_radius_m;not null"`
	SleepEnabled     bool           `gorm:"column:sleep_enabled;not null"`
	BedTime          string         `gorm:"column:bed_time;size:5;not null"`
	WakeTime         string         `gorm:"column:wake_time;size:5;not null"`
	GymWeeklyTarget  int            `gorm:"column:gym_weekly_target;not null;default:0"`
	Nickname         string         `gorm:"column:nickname;size:80;not null;default:''"`
	ThemeMode        string         `gorm:"column:theme_mode;size:8;not null;default:'system'"`
	Notifications    bool           `gorm:"column:notifications;not null;default:true"`
	ShareFriends     bool           `gorm:"column:share_friends;not null;default:false"`
	// Added 2026-10: nullable, unknown until the user enters them (rows of older apps stay NULL).
	Sex      *string `gorm:"column:sex;size:8;check:ck_user_settings_sex,sex IN ('male','female')"`
	Age      *int    `gorm:"column:age"`
	Activity *string `gorm:"column:activity;size:12;check:ck_user_settings_activity,activity IN ('sedentary','low','active','veryActive')"`
	// Inputs JSON: {activityInput, nutrition, foodStyle, allergies, fasting}. The targets columns are the result.
	Inputs    *string   `gorm:"column:inputs;type:text"`
	UpdatedAt time.Time `gorm:"column:updated_at;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Row) TableName() string { return "user_settings" }

// SlotRow is one meal deadline of the settings (table meal_slots).
type SlotRow struct {
	UserID   string `gorm:"column:user_id;primaryKey;size:64"`
	Idx      int    `gorm:"column:idx;primaryKey;autoIncrement:false;check:ck_meal_slots_idx,idx BETWEEN 1 AND 6"`
	Deadline string `gorm:"column:deadline;size:5;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (SlotRow) TableName() string { return "meal_slots" }

// DayRow is one gym weekday, 0=Mon ... 6=Sun (table gym_days).
type DayRow struct {
	UserID  string `gorm:"column:user_id;primaryKey;size:64"`
	Weekday int    `gorm:"column:weekday;primaryKey;autoIncrement:false;check:ck_gym_days_weekday,weekday BETWEEN 0 AND 6"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (DayRow) TableName() string { return "gym_days" }

// AppRow is one app allowed while locked (table allowed_apps). Position keeps the app's order.
type AppRow struct {
	UserID   string `gorm:"column:user_id;primaryKey;size:64"`
	Package  string `gorm:"column:package;primaryKey;size:255"`
	Position int    `gorm:"column:position;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (AppRow) TableName() string { return "allowed_apps" }

// HistoryRow is the targets that applied from a date on (table target_history).
type HistoryRow struct {
	UserID   string        `gorm:"column:user_id;primaryKey;size:64"`
	FromDate platform.Date `gorm:"column:from_date;primaryKey;size:10"`
	Kcal     int           `gorm:"column:kcal;not null"`
	Carbs    int           `gorm:"column:carbs;not null"`
	Protein  int           `gorm:"column:protein;not null"`
	Fat      int           `gorm:"column:fat;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (HistoryRow) TableName() string { return "target_history" }

// Models lists the tables of this package for AutoMigrate (parents first).
func Models() []any { return []any{&Row{}, &SlotRow{}, &DayRow{}, &AppRow{}, &HistoryRow{}} }
