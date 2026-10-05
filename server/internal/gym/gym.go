// Package gym records gym check-ins and bedtime logs.
package gym

import (
	"errors"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

// Verified: geofence (location), photo, or rest (rest coupon).
type Verified string

const (
	Geofence Verified = "geofence"
	Photo    Verified = "photo"
	Rest     Verified = "rest"
)

func (v *Verified) UnmarshalJSON(b []byte) error {
	s, err := platform.EnumJSON(b, "geofence", "photo", "rest")
	*v = Verified(s)
	return err
}

type Log struct {
	ID         uint          `gorm:"primaryKey;autoIncrement"`
	DeviceID   string        `gorm:"column:device_id;size:64;not null;uniqueIndex:ux_gym_device_date"`
	Date       platform.Date `gorm:"column:gym_date;size:10;not null;uniqueIndex:ux_gym_device_date"`
	CheckInAt  *time.Time    `gorm:"column:check_in_at"`
	CheckOutAt *time.Time    `gorm:"column:check_out_at"`
	VerifiedBy Verified      `gorm:"column:verified_by;size:8;not null;check:ck_gym_logs_verified_by,verified_by IN ('geofence','photo','rest')"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE"`
}

func (Log) TableName() string { return "gym_logs" }

type SleepLog struct {
	ID         uint          `gorm:"primaryKey;autoIncrement" json:"id"`
	DeviceID   string        `gorm:"column:device_id;size:64;not null;uniqueIndex:ux_sleep_device_date" json:"-"`
	Date       platform.Date `gorm:"column:sleep_date;size:10;not null;uniqueIndex:ux_sleep_device_date" json:"date"`
	LockedAt   *time.Time    `gorm:"column:locked_at" json:"lockedAt"`
	UnlockedAt *time.Time    `gorm:"column:unlocked_at" json:"unlockedAt"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE" json:"-"`
}

func (SleepLog) TableName() string { return "sleep_logs" }

type Service struct {
	db    *gorm.DB
	locks *lock.Service
	clock platform.Clock
}

func NewService(db *gorm.DB, locks *lock.Service, clock platform.Clock) *Service {
	return &Service{db, locks, clock}
}

func (s *Service) find(deviceID string, date platform.Date) (*Log, error) {
	var g Log
	err := s.db.Where("device_id = ? AND gym_date = ?", deviceID, date).First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &Log{DeviceID: deviceID, Date: date}, nil
	}
	return &g, err
}

// CheckIn records arrival (location) or a photo check; an open gym lock is released.
func (s *Service) CheckIn(deviceID string, date platform.Date, by Verified, at *time.Time) (*Log, error) {
	g, err := s.find(deviceID, date)
	if err != nil {
		return nil, err
	}
	t := s.clock.Now()
	if at != nil {
		t = at.UTC()
	}
	g.VerifiedBy, g.CheckInAt = by, &t
	if err := s.saveLog(g); err != nil {
		return nil, err
	}
	return g, s.locks.ReleaseOpen(deviceID, lock.Gym)
}

// MarkRest marks the day as a rest day (rest coupon). It does not count as a visit.
func (s *Service) MarkRest(deviceID string, date platform.Date) error {
	g, err := s.find(deviceID, date)
	if err != nil {
		return err
	}
	g.VerifiedBy = Rest
	return s.saveLog(g)
}

func (s *Service) Sleep(deviceID string, date platform.Date, lockedAt, unlockedAt *time.Time) (*SleepLog, error) {
	var l SleepLog
	err := s.db.Where("device_id = ? AND sleep_date = ?", deviceID, date).First(&l).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		l = SleepLog{DeviceID: deviceID, Date: date}
	} else if err != nil {
		return nil, err
	}
	if lockedAt != nil {
		t := lockedAt.UTC()
		l.LockedAt = &t
	}
	if unlockedAt != nil {
		t := unlockedAt.UTC()
		l.UnlockedAt = &t
	}
	return &l, s.saveSleep(&l)
}

func (s *Service) saveLog(g *Log) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := platform.EnsureDevice(tx, g.DeviceID); err != nil {
			return err
		}
		return tx.Omit("Device").Save(g).Error
	})
}

func (s *Service) saveSleep(l *SleepLog) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := platform.EnsureDevice(tx, l.DeviceID); err != nil {
			return err
		}
		return tx.Omit("Device").Save(l).Error
	})
}

// WithDB returns a copy bound to another handle (a transaction); locks must be rebound by the caller.
func (s *Service) WithDB(db *gorm.DB, locks *lock.Service) *Service {
	return &Service{db, locks, s.clock}
}
