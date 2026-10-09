// Package share is the public "내 식단" page: anyone with the link sees the meals the owner shared with
// friends (meal_logs.share_friends), without logging in. The link is a random token, not a hash of the user id,
// so it can be turned off or replaced (a leaked link stops working) and reveals nothing about the account.
package share

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/photo"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"gorm.io/gorm"
)

// Days is how far back the public page goes.
const Days = 14

// Link is a user's public page (table share_links). Disabled links keep their token so turning the page back on
// gives the same address; Rotate replaces it.
type Link struct {
	UserID    string    `gorm:"column:user_id;primaryKey;size:64"`
	Token     string    `gorm:"column:token;size:32;not null;uniqueIndex"`
	Enabled   bool      `gorm:"column:enabled;not null"`
	CreatedAt time.Time `gorm:"column:created_at;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Link) TableName() string { return "share_links" }

func Models() []any { return []any{&Link{}} }

// newToken: 15 random bytes → 24 lowercase base32 characters (120 bits, not guessable).
func newToken() (string, error) {
	b := make([]byte, 15)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)), nil
}

type Service struct {
	db     *gorm.DB
	photos *photo.Service
	clock  platform.Clock
	base   string // public base URL (PUBLIC_BASE_URL); "" = from the request
}

func NewService(db *gorm.DB, photos *photo.Service, clock platform.Clock, base string) *Service {
	return &Service{db: db, photos: photos, clock: clock, base: strings.TrimRight(base, "/")}
}

// Status is what the app shows: whether the page is on and its address.
type Status struct {
	Enabled bool   `json:"enabled"`
	Token   string `json:"token"` // "" until the page was turned on once
	URL     string `json:"url"`   // "" while off
}

func (s *Service) status(l *Link, base string) Status {
	if l == nil {
		return Status{}
	}
	st := Status{Enabled: l.Enabled, Token: l.Token}
	if l.Enabled {
		st.URL = base + "/s/" + l.Token
	}
	return st
}

func (s *Service) find(userID string) (*Link, error) {
	var l Link
	err := s.db.First(&l, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &l, err
}

// Get is the owner's current status.
func (s *Service) Get(userID, base string) (Status, error) {
	l, err := s.find(userID)
	return s.status(l, base), err
}

// Enable turns the page on, creating the token the first time.
func (s *Service) Enable(userID, base string) (Status, error) {
	l, err := s.find(userID)
	if err != nil {
		return Status{}, err
	}
	if l == nil {
		t, err := newToken()
		if err != nil {
			return Status{}, err
		}
		l = &Link{UserID: userID, Token: t, CreatedAt: s.clock.Now()}
	}
	l.Enabled = true
	if err := s.db.Omit("User").Save(l).Error; err != nil {
		return Status{}, err
	}
	return s.status(l, base), nil
}

// Disable turns the page off; the address answers 404 until it is turned on again.
func (s *Service) Disable(userID, base string) (Status, error) {
	l, err := s.find(userID)
	if err != nil || l == nil {
		return s.status(l, base), err
	}
	l.Enabled = false
	if err := s.db.Omit("User").Save(l).Error; err != nil {
		return Status{}, err
	}
	return s.status(l, base), nil
}

// Rotate gives the page a new address (the old one stops working) and turns it on.
func (s *Service) Rotate(userID, base string) (Status, error) {
	t, err := newToken()
	if err != nil {
		return Status{}, err
	}
	l, err := s.find(userID)
	if err != nil {
		return Status{}, err
	}
	if l == nil {
		l = &Link{UserID: userID, CreatedAt: s.clock.Now()}
	}
	l.Token, l.Enabled = t, true
	if err := s.db.Omit("User").Save(l).Error; err != nil {
		return Status{}, err
	}
	return s.status(l, base), nil
}

var errNotFound = &platform.Error{Status: http.StatusNotFound, Code: "NOT_FOUND", Message: "없는 페이지예요"}

// owner resolves an enabled token to its user.
func (s *Service) owner(token string) (string, error) {
	var l Link
	err := s.db.First(&l, "token = ? AND enabled = ?", token, true).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", errNotFound
	}
	return l.UserID, err
}

// Page is the data of the public page.
type Page struct {
	Name string
	Days []Day
}

type Day struct {
	Date  platform.Date
	Total meal.Nutrition
	Meals []Meal
	Gym   *time.Time // verified gym check-in time (only when the owner shares with friends)
}

type Meal struct {
	Index     int
	LoggedAt  time.Time
	Foods     []string
	Nutrition meal.Nutrition
	HasPhoto  bool
}

func (s *Service) page(userID string) (Page, error) {
	var row settings.Row
	name := ""
	shareGym := false
	if err := s.db.Select("nickname", "share_friends").First(&row, "user_id = ?", userID).Error; err == nil {
		name, shareGym = row.Nickname, row.ShareFriends
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return Page{}, err
	}
	today := s.clock.Today()
	from := today.AddDays(-(Days - 1))
	all, err := meal.ViewsAll(s.db, userID)
	if err != nil {
		return Page{}, err
	}
	// 사진이 있는 끼니 (바이트를 읽지 않고 행만 본다)
	refs, err := s.photos.Refs(userID)
	if err != nil {
		return Page{}, err
	}
	hasPhoto := map[photo.Ref]bool{}
	for _, r := range refs {
		hasPhoto[r] = true
	}
	byDate := map[platform.Date]*Day{}
	get := func(d platform.Date) *Day {
		if byDate[d] == nil {
			byDate[d] = &Day{Date: d}
		}
		return byDate[d]
	}
	for _, v := range all {
		if !v.ShareFriends || v.Date < from || v.Date > today {
			continue
		}
		foods := make([]string, 0, len(v.Items))
		for _, it := range v.Items {
			foods = append(foods, it.Name)
		}
		d := get(v.Date)
		d.Meals = append(d.Meals, Meal{v.Index, v.LoggedAt, foods, v.Nutrition, hasPhoto[photo.Ref{Date: v.Date, Index: v.Index}]})
		d.Total = d.Total.Plus(v.Nutrition)
	}
	if shareGym {
		var logs []gym.Log
		if err := s.db.Where("user_id = ? AND gym_date BETWEEN ? AND ? AND verified_by IN ? AND check_in_at IS NOT NULL",
			userID, from, today, []string{"geofence", "photo"}).Find(&logs).Error; err != nil {
			return Page{}, err
		}
		for _, g := range logs {
			t := *g.CheckInAt
			get(g.Date).Gym = &t
		}
	}
	p := Page{Name: name}
	for _, d := range byDate {
		sort.Slice(d.Meals, func(i, j int) bool { return d.Meals[i].Index < d.Meals[j].Index })
		p.Days = append(p.Days, *d)
	}
	sort.Slice(p.Days, func(i, j int) bool { return p.Days[i].Date > p.Days[j].Date })
	return p, nil
}

// photo serves a shared meal's photo of the page owner.
func (s *Service) photo(ctx context.Context, token string, date platform.Date, index int) ([]byte, string, error) {
	uid, err := s.owner(token)
	if err != nil {
		return nil, "", err
	}
	var m meal.Log
	err = s.db.Where("user_id = ? AND meal_date = ? AND meal_index = ? AND share_friends = ?", uid, date, index, true).
		First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, "", errNotFound
	}
	if err != nil {
		return nil, "", err
	}
	return s.photos.Get(ctx, uid, date, index)
}
