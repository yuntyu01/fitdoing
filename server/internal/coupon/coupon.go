// Package coupon handles rest coupons, cheat coupons and emergency releases.
// They reset every Monday; only uses are stored.
package coupon

import (
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"gorm.io/gorm"
)

type Type string

const (
	Rest      Type = "rest"
	Cheat     Type = "cheat"
	Emergency Type = "emergency"
)

type Use struct {
	ID       uint          `gorm:"primaryKey;autoIncrement" json:"-"`
	DeviceID string        `gorm:"column:device_id;size:64;not null;uniqueIndex:ux_coupon_use,priority:1;index:ix_coupon_week,priority:1" json:"-"`
	Type     Type          `gorm:"column:type;size:10;not null;uniqueIndex:ux_coupon_use,priority:2;check:ck_coupon_uses_type,type IN ('rest','cheat','emergency')" json:"type"`
	UsedAt   time.Time     `gorm:"column:used_at;not null;uniqueIndex:ux_coupon_use,priority:3" json:"usedAt"`
	WeekKey  platform.Date `gorm:"column:week_key;size:10;not null;index:ix_coupon_week,priority:2" json:"-"`

	Device *platform.Device `gorm:"foreignKey:DeviceID;references:DeviceKey;constraint:OnDelete:CASCADE" json:"-"`
}

func (Use) TableName() string { return "coupon_uses" }

type Balance struct {
	Total int `json:"total"`
	Left  int `json:"left"`
}

type Summary struct {
	WeekKey   platform.Date `json:"weekKey"`
	Rest      Balance       `json:"rest"`
	Cheat     Balance       `json:"cheat"`
	Emergency Balance       `json:"emergency"`
	Uses      []Use         `json:"uses"`
}

func (s Summary) balance(t Type) Balance {
	switch t {
	case Rest:
		return s.Rest
	case Cheat:
		return s.Cheat
	}
	return s.Emergency
}

type Service struct {
	db       *gorm.DB
	settings *settings.Service
	gym      *gym.Service
	clock    platform.Clock
}

// WithDB returns a copy bound to another handle (a transaction); settings and gym must be rebound by the caller.
func (s *Service) WithDB(db *gorm.DB, st *settings.Service, g *gym.Service) *Service {
	return &Service{db, st, g, s.clock}
}

func NewService(db *gorm.DB, st *settings.Service, g *gym.Service, clock platform.Clock) *Service {
	return &Service{db, st, g, clock}
}

// Summary is this week's coupon state; date is the device-local date.
func (s *Service) Summary(deviceID string, date platform.Date) (Summary, error) {
	st, err := s.settings.Current(deviceID)
	if err != nil {
		return Summary{}, err
	}
	week := date.Monday()
	uses := []Use{}
	if err := s.db.Where("device_id = ? AND week_key = ?", deviceID, week).Order("used_at ASC, id ASC").Find(&uses).Error; err != nil {
		return Summary{}, err
	}
	bal := func(t Type, total int) Balance {
		used := 0
		for _, u := range uses {
			if u.Type == t {
				used++
			}
		}
		return Balance{total, max(0, total-used)}
	}
	return Summary{week, bal(Rest, st.Coupons.Rest), bal(Cheat, st.Coupons.Cheat),
		bal(Emergency, st.EmergencyPerWeek), uses}, nil
}

// UseRest spends a rest coupon and marks that day's gym as rest.
func (s *Service) UseRest(deviceID string, date platform.Date) error {
	if err := s.Consume(deviceID, Rest, date); err != nil {
		return err
	}
	return s.gym.MarkRest(deviceID, date)
}

// RestSummary spends a rest coupon (POST /api/coupons/rest) and returns the new summary.
func (s *Service) RestSummary(deviceID string, date platform.Date) (Summary, error) {
	if err := s.UseRest(deviceID, date); err != nil {
		return Summary{}, err
	}
	return s.Summary(deviceID, date)
}

func (s *Service) ConsumeEmergency(deviceID string, date platform.Date) error {
	return s.Consume(deviceID, Emergency, date)
}

// TryConsume spends one coupon if any are left. (Cheat coupons never block a meal when empty.)
func (s *Service) TryConsume(deviceID string, t Type, date platform.Date) (bool, error) {
	sum, err := s.Summary(deviceID, date)
	if err != nil || sum.balance(t).Left <= 0 {
		return false, err
	}
	u := Use{DeviceID: deviceID, Type: t, UsedAt: s.clock.Now(), WeekKey: date.Monday()}
	return true, s.db.Omit("Device").Create(&u).Error
}

func (s *Service) Consume(deviceID string, t Type, date platform.Date) error {
	ok, err := s.TryConsume(deviceID, t, date)
	if err != nil {
		return err
	}
	if !ok {
		return platform.Conflict("COUPON_EMPTY", "이번 주에 쓸 수 있는 장수를 다 썼어요")
	}
	return nil
}
