// Package lock records lock history. Deciding to lock/unlock happens on the phone (offline);
// the server only stores the outcome. Calories never cause a lock.
package lock

import (
	"errors"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

type Type string

const (
	Meal  Type = "meal"
	Gym   Type = "gym"
	Sleep Type = "sleep"
)

func (t *Type) UnmarshalJSON(b []byte) error {
	s, err := platform.EnumJSON(b, "meal", "gym", "sleep")
	*t = Type(s)
	return err
}

// ReleasedBy: action (photo/arrival), time, emergency release, coupon.
type ReleasedBy string

const (
	ByAction    ReleasedBy = "action"
	ByTime      ReleasedBy = "time"
	ByEmergency ReleasedBy = "emergency"
	ByCoupon    ReleasedBy = "coupon"
)

func (r *ReleasedBy) UnmarshalJSON(b []byte) error {
	s, err := platform.EnumJSON(b, "action", "time", "emergency", "coupon")
	*r = ReleasedBy(s)
	return err
}

// Event is one lock. Date is the device-local day it started (used by the records calendar).
type Event struct {
	ID         uint          `gorm:"primaryKey;autoIncrement" json:"id"`
	DeviceID   string        `gorm:"column:device_id;size:64;not null;uniqueIndex:ux_lock_event,priority:1;index:ix_lock_date,priority:1" json:"-"`
	Type       Type          `gorm:"column:type;size:8;not null;uniqueIndex:ux_lock_event,priority:2;check:ck_lock_events_type,type IN ('meal','gym','sleep')" json:"type"`
	Date       platform.Date `gorm:"column:lock_date;size:10;not null;index:ix_lock_date,priority:2" json:"date"`
	StartedAt  time.Time     `gorm:"column:started_at;not null;uniqueIndex:ux_lock_event,priority:3" json:"startedAt"`
	EndedAt    *time.Time    `gorm:"column:ended_at" json:"endedAt"`
	ReleasedBy *ReleasedBy   `gorm:"column:released_by;size:12;check:ck_lock_events_released_by,released_by IN ('action','time','emergency','coupon')" json:"releasedBy"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE" json:"-"`
}

func (Event) TableName() string { return "lock_events" }

// Coupons is what releasing needs from the coupon service (kept as an interface to avoid an import cycle).
type Coupons interface {
	ConsumeEmergency(deviceID string, date platform.Date) error
	UseRest(deviceID string, date platform.Date) error
}

type Service struct {
	db      *gorm.DB
	coupons Coupons
	clock   platform.Clock
}

func NewService(db *gorm.DB, clock platform.Clock) *Service { return &Service{db: db, clock: clock} }

func (s *Service) SetCoupons(c Coupons) { s.coupons = c }

func (s *Service) open(deviceID string, t Type) (*Event, error) {
	var e Event
	err := s.db.Where("device_id = ? AND type = ? AND ended_at IS NULL", deviceID, t).
		Order("started_at DESC").First(&e).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &e, err
}

// Start records a lock; if one of that type is already open it is returned unchanged.
func (s *Service) Start(deviceID string, t Type, date platform.Date, startedAt *time.Time) (*Event, error) {
	if e, err := s.open(deviceID, t); err != nil || e != nil {
		return e, err
	}
	e := &Event{DeviceID: deviceID, Type: t, Date: date, StartedAt: s.clock.Now()}
	if startedAt != nil {
		e.StartedAt = startedAt.UTC()
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := platform.EnsureDevice(tx, deviceID); err != nil {
			return err
		}
		return tx.Omit("Device").Create(e).Error
	})
	return e, err
}

// Release ends a lock. Emergency uses the weekly emergency count; coupon uses a rest coupon (gym only).
func (s *Service) Release(deviceID string, id uint, by ReleasedBy, date platform.Date) (*Event, error) {
	var e Event
	err := s.db.First(&e, "id = ? AND device_id = ?", id, deviceID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, platform.NotFound("잠금 기록이 없어요")
	} else if err != nil {
		return nil, err
	}
	if e.EndedAt != nil {
		return &e, nil
	}
	switch by {
	case ByEmergency:
		if err := s.coupons.ConsumeEmergency(deviceID, date); err != nil {
			return nil, err
		}
	case ByCoupon:
		if e.Type != Gym {
			return nil, platform.BadRequest("INVALID", "휴식권은 헬스 잠금에만 쓸 수 있어요")
		}
		if err := s.coupons.UseRest(deviceID, date); err != nil {
			return nil, err
		}
	}
	now := s.clock.Now()
	e.EndedAt, e.ReleasedBy = &now, &by
	return &e, s.db.Omit("Device").Save(&e).Error
}

// ReleaseOpen releases the open lock of a type by action (photo saved, arrived).
func (s *Service) ReleaseOpen(deviceID string, t Type) error {
	e, err := s.open(deviceID, t)
	if err != nil || e == nil {
		return err
	}
	now, by := s.clock.Now(), ByAction
	e.EndedAt, e.ReleasedBy = &now, &by
	return s.db.Omit("Device").Save(e).Error
}

// WithDB returns a copy bound to another handle (a transaction); coupons must be rebound by the caller.
func (s *Service) WithDB(db *gorm.DB) *Service { return &Service{db: db, clock: s.clock} }
