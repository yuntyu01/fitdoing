package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

type Service struct {
	db    *gorm.DB
	clock platform.Clock
}

func NewService(db *gorm.DB, clock platform.Clock) *Service { return &Service{db, clock} }

// WithDB returns the service bound to another handle (a transaction).
func (s *Service) WithDB(db *gorm.DB) *Service { return &Service{db, s.clock} }

// Exists reports whether settings were ever stored for the user (Get would create defaults).
func (s *Service) Exists(userID string) (bool, error) {
	var n int64
	err := s.db.Model(&Row{}).Where("user_id = ?", userID).Count(&n).Error
	return n > 0, err
}

// Get returns the applied settings. A pending mode change whose start date has passed is applied.
func (s *Service) Get(userID string) (View, error) {
	cur, row, err := s.load(userID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if row, err = s.save(userID, Defaults(), nil, nil); err != nil {
			return View{}, err
		}
		if cur, _, err = s.load(userID); err != nil {
			return View{}, err
		}
	} else if err != nil {
		return View{}, err
	}
	if row.PendingMode != nil && row.PendingFrom != nil && s.clock.Today() >= *row.PendingFrom {
		cur.Mode = Mode(*row.PendingMode)
		if row, err = s.save(userID, cur, nil, nil); err != nil {
			return View{}, err
		}
	}
	return viewOf(cur, row), nil
}

// Current is the applied settings only.
func (s *Service) Current(userID string) (Settings, error) {
	v, err := s.Get(userID)
	return v.Settings, err
}

// Put validates and stores settings. Lowering the mode applies from next Monday.
func (s *Service) Put(userID string, in Settings) (View, error) {
	if err := in.Validate(); err != nil {
		return View{}, err
	}
	if err := validateRules(in); err != nil {
		return View{}, err
	}
	cur, err := s.Current(userID)
	if err != nil {
		return View{}, err
	}
	in.Merge(cur)
	in.TargetHistory = s.nextHistory(in, cur)
	var pending *Mode
	var from *platform.Date
	next := in
	if in.Mode.rank() < cur.Mode.rank() {
		m := in.Mode
		f := s.clock.Today().NextMonday()
		pending, from = &m, &f
		next.Mode = cur.Mode
	}
	row, err := s.save(userID, next, pending, from)
	if err != nil {
		return View{}, err
	}
	return viewOf(next, row), nil
}

// Backup stores settings exactly as the phone has them (the local copy is the truth): no delayed
// mode lowering, no 1200 kcal floor, no meal-number continuity check. Only the format is validated.
// A pending mode change is cleared. The result is read back from the normalized tables.
func (s *Service) Backup(userID string, in Settings) (View, error) {
	if err := in.Validate(); err != nil {
		return View{}, err
	}
	seen := map[int]bool{}
	for _, m := range in.Meals {
		if seen[m.Index] {
			return View{}, platform.Invalid("meals.index", "겹치면 안 돼요")
		}
		seen[m.Index] = true
	}
	cur, _, err := s.load(userID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return View{}, err
	}
	if err == nil {
		in.Merge(cur)
		in.TargetHistory = s.nextHistory(in, cur)
	}
	if _, err := s.save(userID, in, nil, nil); err != nil {
		return View{}, err
	}
	st, row, err := s.load(userID)
	if err != nil {
		return View{}, err
	}
	return viewOf(st, row), nil
}

// nextHistory: the app's targetHistory when it sent one; for an older app, the stored history plus the
// change of targets from today on, so past dates keep the targets they had.
func (s *Service) nextHistory(in, cur Settings) Opt[[]TargetEntry] {
	if in.TargetHistory.Set {
		return in.TargetHistory
	}
	var h []TargetEntry
	if cur.TargetHistory.Val != nil {
		h = *cur.TargetHistory.Val
	}
	if cur.Targets != nil && in.Targets != nil {
		h = recordTargets(h, *cur.Targets, *in.Targets, s.clock.Today())
	}
	return Some(h)
}

// History is the stored targets per date, oldest first.
func (s *Service) History(userID string) ([]TargetEntry, error) {
	var rows []HistoryRow
	if err := s.db.Where("user_id = ?", userID).Order("from_date").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]TargetEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, TargetEntry{From: r.FromDate, Targets: Targets{r.Kcal, r.Carbs, r.Protein, r.Fat}})
	}
	return out, nil
}

// inputs is the JSON kept in user_settings.inputs.
type inputs struct {
	ActivityInput *json.RawMessage `json:"activityInput,omitempty"`
	Nutrition     *json.RawMessage `json:"nutrition,omitempty"`
	FoodStyle     *json.RawMessage `json:"foodStyle,omitempty"`
	Allergies     *[]string        `json:"allergies,omitempty"`
	Fasting       *json.RawMessage `json:"fasting,omitempty"`
}

func viewOf(st Settings, row Row) View {
	v := View{Settings: st, PendingFrom: row.PendingFrom}
	if row.PendingMode != nil {
		m := Mode(*row.PendingMode)
		v.PendingMode = &m
	}
	return v
}

func validateRules(s Settings) error {
	if s.Targets.Kcal < MinKcal {
		return platform.BadRequest("TARGET_BELOW_MINIMUM", fmt.Sprintf("목표 칼로리는 %dkcal 아래로 못 낮춰요", MinKcal))
	}
	idx := map[int]bool{}
	for _, m := range s.Meals {
		idx[m.Index] = true
	}
	for i := 1; i <= len(s.Meals); i++ {
		if !idx[i] {
			return platform.BadRequest("INVALID", "끼니 번호는 1부터 빠짐없이 이어져야 해요")
		}
	}
	return nil
}

// save writes the scalar row and replaces the child rows, all in one transaction.
func (s *Service) save(userID string, st Settings, pending *Mode, from *platform.Date) (Row, error) {
	row := Row{
		UserID: userID, Mode: string(st.Mode), PendingFrom: from, Goal: string(st.Goal),
		HeightCm: st.HeightCm, WeightKg: st.WeightKg, LockMinutes: st.LockMinutes,
		EmergencyPerWeek: st.EmergencyPerWeek, PhotoBackup: st.PhotoBackup,
		CouponRest: st.Coupons.Rest, CouponCheat: st.Coupons.Cheat,
		TargetKcal: st.Targets.Kcal, TargetCarbs: st.Targets.Carbs,
		TargetProtein: st.Targets.Protein, TargetFat: st.Targets.Fat,
		GymEnabled: st.Gym.Enabled, GymArriveBy: st.Gym.ArriveBy,
		GymName: deref(st.Gym.Name), GymAddress: deref(st.Gym.Address),
		GymLat: st.Gym.Lat, GymLng: st.Gym.Lng, GymRadiusM: st.Gym.RadiusM,
		SleepEnabled: st.Sleep.Enabled, BedTime: st.Sleep.BedTime, WakeTime: st.Sleep.WakeTime,
		GymWeeklyTarget: st.Gym.WeeklyTarget, Nickname: st.Nickname, ThemeMode: st.ThemeMode,
		Notifications: st.Notifications == nil || *st.Notifications, ShareFriends: st.ShareFriends,
		UpdatedAt: s.clock.Now(),
	}
	if row.ThemeMode == "" {
		row.ThemeMode = "system"
	}
	if st.Sex.Val != nil {
		row.Sex = ptr(string(*st.Sex.Val))
	}
	row.Age = st.Age.Val
	if st.Activity.Val != nil {
		row.Activity = ptr(string(*st.Activity.Val))
	}
	in := inputs{st.ActivityInput.Val, st.Nutrition.Val, st.FoodStyle.Val, st.Allergies.Val, st.Fasting.Val}
	if in != (inputs{}) {
		b, err := json.Marshal(in)
		if err != nil {
			return row, err
		}
		row.Inputs = ptr(string(b))
	}
	var history []HistoryRow
	if st.TargetHistory.Val != nil {
		for _, e := range *st.TargetHistory.Val {
			history = append(history, HistoryRow{UserID: userID, FromDate: e.From, Kcal: e.Kcal, Carbs: e.Carbs,
				Protein: e.Protein, Fat: e.Fat})
		}
	}
	if pending != nil {
		p := string(*pending)
		row.PendingMode = &p
	}
	slots := make([]SlotRow, 0, len(st.Meals))
	for _, m := range st.Meals {
		slots = append(slots, SlotRow{UserID: userID, Idx: m.Index, Deadline: m.Deadline})
	}
	days := []DayRow{}
	seenDay := map[int]bool{}
	for _, d := range st.Gym.Days {
		if !seenDay[d] {
			seenDay[d] = true
			days = append(days, DayRow{UserID: userID, Weekday: d})
		}
	}
	apps := []AppRow{}
	seenApp := map[string]bool{}
	for _, a := range st.AllowedApps {
		if !seenApp[a] && a != "" {
			seenApp[a] = true
			apps = append(apps, AppRow{UserID: userID, Package: a, Position: len(apps)})
		}
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("User").Save(&row).Error; err != nil {
			return err
		}
		for _, m := range []any{&SlotRow{}, &DayRow{}, &AppRow{}} {
			if err := tx.Where("user_id = ?", userID).Delete(m).Error; err != nil {
				return err
			}
		}
		if len(slots) > 0 {
			if err := tx.Omit("User").Create(&slots).Error; err != nil {
				return err
			}
		}
		if len(days) > 0 {
			if err := tx.Omit("User").Create(&days).Error; err != nil {
				return err
			}
		}
		if len(apps) > 0 {
			if err := tx.Omit("User").Create(&apps).Error; err != nil {
				return err
			}
		}
		// history is replaced only when the settings carry it (Set); otherwise it is left as stored
		if st.TargetHistory.Set {
			if err := tx.Where("user_id = ?", userID).Delete(&HistoryRow{}).Error; err != nil {
				return err
			}
			if len(history) > 0 {
				if err := tx.Omit("User").Create(&history).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	return row, err
}

// load assembles the settings of a user from the normalized tables (gorm.ErrRecordNotFound if none).
func (s *Service) load(userID string) (Settings, Row, error) {
	var row Row
	if err := s.db.First(&row, "user_id = ?", userID).Error; err != nil {
		return Settings{}, row, err
	}
	var slots []SlotRow
	var days []DayRow
	var apps []AppRow
	if err := s.db.Where("user_id = ?", userID).Order("idx").Find(&slots).Error; err != nil {
		return Settings{}, row, err
	}
	if err := s.db.Where("user_id = ?", userID).Order("weekday").Find(&days).Error; err != nil {
		return Settings{}, row, err
	}
	if err := s.db.Where("user_id = ?", userID).Order("position").Find(&apps).Error; err != nil {
		return Settings{}, row, err
	}
	st := Settings{
		Mode: Mode(row.Mode), Goal: Goal(row.Goal), HeightCm: row.HeightCm, WeightKg: row.WeightKg,
		Meals: make([]MealSlot, 0, len(slots)),
		Gym: &Gym{Enabled: row.GymEnabled, Days: make([]int, 0, len(days)), ArriveBy: row.GymArriveBy,
			Name: ptr(row.GymName), Address: ptr(row.GymAddress), Lat: row.GymLat, Lng: row.GymLng,
			RadiusM: row.GymRadiusM},
		Sleep:       &Sleep{Enabled: row.SleepEnabled, BedTime: row.BedTime, WakeTime: row.WakeTime},
		Coupons:     &Coupons{Rest: row.CouponRest, Cheat: row.CouponCheat},
		Targets:     &Targets{Kcal: row.TargetKcal, Carbs: row.TargetCarbs, Protein: row.TargetProtein, Fat: row.TargetFat},
		AllowedApps: make([]string, 0, len(apps)),
		LockMinutes: row.LockMinutes, EmergencyPerWeek: row.EmergencyPerWeek, PhotoBackup: row.PhotoBackup,
		Nickname: row.Nickname, ThemeMode: row.ThemeMode, Notifications: ptr(row.Notifications),
		ShareFriends: row.ShareFriends,
	}
	st.Gym.WeeklyTarget = row.GymWeeklyTarget
	st.Sex, st.Age, st.Activity = None[Sex](), Opt[int]{Set: true, Val: row.Age}, None[Activity]()
	if row.Sex != nil {
		st.Sex = Some(Sex(*row.Sex))
	}
	if row.Activity != nil {
		st.Activity = Some(Activity(*row.Activity))
	}
	var in inputs
	if row.Inputs != nil {
		if err := json.Unmarshal([]byte(*row.Inputs), &in); err != nil {
			return Settings{}, row, err
		}
	}
	st.ActivityInput = Opt[json.RawMessage]{Set: true, Val: in.ActivityInput}
	st.Nutrition = Opt[json.RawMessage]{Set: true, Val: in.Nutrition}
	st.FoodStyle = Opt[json.RawMessage]{Set: true, Val: in.FoodStyle}
	st.Allergies = Opt[[]string]{Set: true, Val: in.Allergies}
	st.Fasting = Opt[json.RawMessage]{Set: true, Val: in.Fasting}
	h, err := s.History(userID)
	if err != nil {
		return Settings{}, row, err
	}
	st.TargetHistory = Some(h)
	for _, m := range slots {
		st.Meals = append(st.Meals, MealSlot{Index: m.Idx, Deadline: m.Deadline})
	}
	for _, d := range days {
		st.Gym.Days = append(st.Gym.Days, d.Weekday)
	}
	sort.Ints(st.Gym.Days)
	st.Normalize()
	for _, a := range apps {
		st.AllowedApps = append(st.AllowedApps, a.Package)
	}
	return st, row, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// Restore stores settings as given (used by the legacy-schema migration). Settings must be valid.
func (s *Service) Restore(userID string, st Settings, pending *Mode, from *platform.Date) error {
	_, err := s.save(userID, st, pending, from)
	return err
}
