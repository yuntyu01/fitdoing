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
	ID      uint          `gorm:"primaryKey;autoIncrement" json:"-"`
	UserID  string        `gorm:"column:user_id;size:64;not null;uniqueIndex:ux_coupon_use,priority:1;index:ix_coupon_week,priority:1" json:"-"`
	Type    Type          `gorm:"column:type;size:10;not null;uniqueIndex:ux_coupon_use,priority:2;check:ck_coupon_uses_type,type IN ('rest','cheat','emergency')" json:"type"`
	UsedAt  time.Time     `gorm:"column:used_at;not null;uniqueIndex:ux_coupon_use,priority:3" json:"usedAt"`
	WeekKey platform.Date `gorm:"column:week_key;size:10;not null;index:ix_coupon_week,priority:2" json:"-"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE" json:"-"`
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

// Summary is this week's coupon state; date is the user-local date.
func (s *Service) Summary(userID string, date platform.Date) (Summary, error) {
	st, err := s.settings.Current(userID)
	if err != nil {
		return Summary{}, err
	}
	week := date.Monday()
	uses := []Use{}
	if err := s.db.Where("user_id = ? AND week_key = ?", userID, week).Order("used_at ASC, id ASC").Find(&uses).Error; err != nil {
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
func (s *Service) UseRest(userID string, date platform.Date) error {
	if err := s.Consume(userID, Rest, date); err != nil {
		return err
	}
	return s.gym.MarkRest(userID, date)
}

// RestSummary spends a rest coupon (POST /api/coupons/rest) and returns the new summary.
func (s *Service) RestSummary(userID string, date platform.Date) (Summary, error) {
	if err := s.UseRest(userID, date); err != nil {
		return Summary{}, err
	}
	return s.Summary(userID, date)
}

func (s *Service) ConsumeEmergency(userID string, date platform.Date) error {
	return s.Consume(userID, Emergency, date)
}

// TryConsume spends one coupon if any are left. (Cheat coupons never block a meal when empty.)
func (s *Service) TryConsume(userID string, t Type, date platform.Date) (bool, error) {
	sum, err := s.Summary(userID, date)
	if err != nil || sum.balance(t).Left <= 0 {
		return false, err
	}
	u := Use{UserID: userID, Type: t, UsedAt: s.clock.Now(), WeekKey: date.Monday()}
	return true, s.db.Omit("User").Create(&u).Error
}

func (s *Service) Consume(userID string, t Type, date platform.Date) error {
	ok, err := s.TryConsume(userID, t, date)
	if err != nil {
		return err
	}
	if !ok {
		return platform.Conflict("COUPON_EMPTY", "이번 주에 쓸 수 있는 장수를 다 썼어요")
	}
	return nil
}
