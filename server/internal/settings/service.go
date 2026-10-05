package settings

import (
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

// Exists reports whether settings were ever stored for the device (Get would create defaults).
func (s *Service) Exists(deviceID string) (bool, error) {
	var n int64
	err := s.db.Model(&Row{}).Where("device_id = ?", deviceID).Count(&n).Error
	return n > 0, err
}

// Get returns the applied settings. A pending mode change whose start date has passed is applied.
func (s *Service) Get(deviceID string) (View, error) {
	cur, row, err := s.load(deviceID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if row, err = s.save(deviceID, Defaults(), nil, nil); err != nil {
			return View{}, err
		}
		if cur, _, err = s.load(deviceID); err != nil {
			return View{}, err
		}
	} else if err != nil {
		return View{}, err
	}
	if row.PendingMode != nil && row.PendingFrom != nil && s.clock.Today() >= *row.PendingFrom {
		cur.Mode = Mode(*row.PendingMode)
		if row, err = s.save(deviceID, cur, nil, nil); err != nil {
			return View{}, err
		}
	}
	return viewOf(cur, row), nil
}

// Current is the applied settings only.
func (s *Service) Current(deviceID string) (Settings, error) {
	v, err := s.Get(deviceID)
	return v.Settings, err
}

// Put validates and stores settings. Lowering the mode applies from next Monday.
func (s *Service) Put(deviceID string, in Settings) (View, error) {
	if err := in.Validate(); err != nil {
		return View{}, err
	}
	if err := validateRules(in); err != nil {
		return View{}, err
	}
	cur, err := s.Current(deviceID)
	if err != nil {
		return View{}, err
	}
	var pending *Mode
	var from *platform.Date
	next := in
	if in.Mode.rank() < cur.Mode.rank() {
		m := in.Mode
		f := s.clock.Today().NextMonday()
		pending, from = &m, &f
		next.Mode = cur.Mode
	}
	row, err := s.save(deviceID, next, pending, from)
	if err != nil {
		return View{}, err
	}
	return viewOf(next, row), nil
}

// Backup stores settings exactly as the phone has them (the local copy is the truth): no delayed
// mode lowering, no 1200 kcal floor, no meal-number continuity check. Only the format is validated.
// A pending mode change is cleared. The result is read back from the normalized tables.
func (s *Service) Backup(deviceID string, in Settings) (View, error) {
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
	if _, err := s.save(deviceID, in, nil, nil); err != nil {
		return View{}, err
	}
	st, row, err := s.load(deviceID)
	if err != nil {
		return View{}, err
	}
	return viewOf(st, row), nil
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
func (s *Service) save(deviceID string, st Settings, pending *Mode, from *platform.Date) (Row, error) {
	row := Row{
		DeviceID: deviceID, Mode: string(st.Mode), PendingFrom: from, Goal: string(st.Goal),
		HeightCm: st.HeightCm, WeightKg: st.WeightKg, LockMinutes: st.LockMinutes,
		EmergencyPerWeek: st.EmergencyPerWeek, PhotoBackup: st.PhotoBackup,
		CouponRest: st.Coupons.Rest, CouponCheat: st.Coupons.Cheat,
		TargetKcal: st.Targets.Kcal, TargetCarbs: st.Targets.Carbs,
		TargetProtein: st.Targets.Protein, TargetFat: st.Targets.Fat,
		GymEnabled: st.Gym.Enabled, GymArriveBy: st.Gym.ArriveBy,
		GymName: deref(st.Gym.Name), GymAddress: deref(st.Gym.Address),
		GymLat: st.Gym.Lat, GymLng: st.Gym.Lng, GymRadiusM: st.Gym.RadiusM,
		SleepEnabled: st.Sleep.Enabled, BedTime: st.Sleep.BedTime, WakeTime: st.Sleep.WakeTime,
		UpdatedAt: s.clock.Now(),
	}
	if pending != nil {
		p := string(*pending)
		row.PendingMode = &p
	}
	slots := make([]SlotRow, 0, len(st.Meals))
	for _, m := range st.Meals {
		slots = append(slots, SlotRow{DeviceID: deviceID, Idx: m.Index, Deadline: m.Deadline})
	}
	days := []DayRow{}
	seenDay := map[int]bool{}
	for _, d := range st.Gym.Days {
		if !seenDay[d] {
			seenDay[d] = true
			days = append(days, DayRow{DeviceID: deviceID, Weekday: d})
		}
	}
	apps := []AppRow{}
	seenApp := map[string]bool{}
	for _, a := range st.AllowedApps {
		if !seenApp[a] && a != "" {
			seenApp[a] = true
			apps = append(apps, AppRow{DeviceID: deviceID, Package: a, Position: len(apps)})
		}
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := platform.EnsureDevice(tx, deviceID); err != nil {
			return err
		}
		if err := tx.Omit("Device").Save(&row).Error; err != nil {
			return err
		}
		for _, m := range []any{&SlotRow{}, &DayRow{}, &AppRow{}} {
			if err := tx.Where("device_id = ?", deviceID).Delete(m).Error; err != nil {
				return err
			}
		}
		if len(slots) > 0 {
			if err := tx.Omit("Device").Create(&slots).Error; err != nil {
				return err
			}
		}
		if len(days) > 0 {
			if err := tx.Omit("Device").Create(&days).Error; err != nil {
				return err
			}
		}
		if len(apps) > 0 {
			if err := tx.Omit("Device").Create(&apps).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return row, err
}

// load assembles the settings of a device from the normalized tables (gorm.ErrRecordNotFound if none).
func (s *Service) load(deviceID string) (Settings, Row, error) {
	var row Row
	if err := s.db.First(&row, "device_id = ?", deviceID).Error; err != nil {
		return Settings{}, row, err
	}
	var slots []SlotRow
	var days []DayRow
	var apps []AppRow
	if err := s.db.Where("device_id = ?", deviceID).Order("idx").Find(&slots).Error; err != nil {
		return Settings{}, row, err
	}
	if err := s.db.Where("device_id = ?", deviceID).Order("weekday").Find(&days).Error; err != nil {
		return Settings{}, row, err
	}
	if err := s.db.Where("device_id = ?", deviceID).Order("position").Find(&apps).Error; err != nil {
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
	}
	for _, m := range slots {
		st.Meals = append(st.Meals, MealSlot{Index: m.Idx, Deadline: m.Deadline})
	}
	for _, d := range days {
		st.Gym.Days = append(st.Gym.Days, d.Weekday)
	}
	sort.Ints(st.Gym.Days)
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
func (s *Service) Restore(deviceID string, st Settings, pending *Mode, from *platform.Date) error {
	_, err := s.save(deviceID, st, pending, from)
	return err
}
