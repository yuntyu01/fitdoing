// Package settings holds the per-device settings backup, goals and targets.
package settings

import (
	"math"
	"regexp"
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
	GoalGain Goal = "gain"
)

func (g *Goal) UnmarshalJSON(b []byte) error {
	s, err := platform.EnumJSON(b, "lose", "keep", "gain")
	*g = Goal(s)
	return err
}

func (g Goal) kcalPerKg() float64 {
	switch g {
	case GoalLose:
		return 25
	case GoalGain:
		return 35
	}
	return 30
}

func (g Goal) proteinPerKg() float64 {
	switch g {
	case GoalLose:
		return 2.0
	case GoalGain:
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
	Enabled  bool     `json:"enabled"`
	Days     []int    `json:"days"` // 0=Mon ... 6=Sun
	ArriveBy string   `json:"arriveBy"`
	Name     *string  `json:"name"`
	Address  *string  `json:"address"`
	Lat      *float64 `json:"lat"`
	Lng      *float64 `json:"lng"`
	RadiusM  int      `json:"radiusM"`
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
// apps live in their own tables (SlotRow, DayRow, AppRow); everything cascades from devices.
type Row struct {
	DeviceID         string         `gorm:"column:device_id;primaryKey;size:64"`
	Mode             string         `gorm:"column:mode;size:8;not null;check:ck_user_settings_mode,mode IN ('mild','normal','spicy')"`
	PendingMode      *string        `gorm:"column:pending_mode;size:8;check:ck_user_settings_pending,pending_mode IN ('mild','normal','spicy')"`
	PendingFrom      *platform.Date `gorm:"column:pending_from;size:10"`
	Goal             string         `gorm:"column:goal;size:8;not null;check:ck_user_settings_goal,goal IN ('lose','keep','gain')"`
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
	UpdatedAt        time.Time      `gorm:"column:updated_at;not null"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE"`
}

func (Row) TableName() string { return "user_settings" }

// SlotRow is one meal deadline of the settings (table meal_slots).
type SlotRow struct {
	DeviceID string `gorm:"column:device_id;primaryKey;size:64"`
	Idx      int    `gorm:"column:idx;primaryKey;autoIncrement:false;check:ck_meal_slots_idx,idx BETWEEN 1 AND 6"`
	Deadline string `gorm:"column:deadline;size:5;not null"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE"`
}

func (SlotRow) TableName() string { return "meal_slots" }

// DayRow is one gym weekday, 0=Mon ... 6=Sun (table gym_days).
type DayRow struct {
	DeviceID string `gorm:"column:device_id;primaryKey;size:64"`
	Weekday  int    `gorm:"column:weekday;primaryKey;autoIncrement:false;check:ck_gym_days_weekday,weekday BETWEEN 0 AND 6"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE"`
}

func (DayRow) TableName() string { return "gym_days" }

// AppRow is one app allowed while locked (table allowed_apps). Position keeps the app's order.
type AppRow struct {
	DeviceID string `gorm:"column:device_id;primaryKey;size:64"`
	Package  string `gorm:"column:package;primaryKey;size:255"`
	Position int    `gorm:"column:position;not null"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE"`
}

func (AppRow) TableName() string { return "allowed_apps" }

// Models lists the tables of this package for AutoMigrate (parents first).
func Models() []any { return []any{&Row{}, &SlotRow{}, &DayRow{}, &AppRow{}} }
