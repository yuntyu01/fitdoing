// Package meal records meals (photo -> recognition -> correction done on the phone; no photo is sent).
package meal

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/coupon"
	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"gorm.io/gorm"
)

// Log is one meal of one day. The same (user, date, index) is overwritten.
type Log struct {
	ID         string        `gorm:"primaryKey;size:36"`
	UserID     string        `gorm:"column:user_id;size:64;not null;uniqueIndex:ux_meal_slot"`
	Date       platform.Date `gorm:"column:meal_date;size:10;not null;uniqueIndex:ux_meal_slot"`
	Index      int           `gorm:"column:meal_index;not null;uniqueIndex:ux_meal_slot"`
	Deadline   string        `gorm:"column:deadline;size:5;not null"`
	Barcode    *string       `gorm:"column:barcode"`
	Kcal       int           `gorm:"column:kcal;not null"`
	Carbs      int           `gorm:"column:carbs;not null"`
	Protein    int           `gorm:"column:protein;not null"`
	Fat        int           `gorm:"column:fat;not null"`
	Confidence float64       `gorm:"column:confidence;not null"`
	Portion    float64       `gorm:"column:portion;not null;check:ck_meal_logs_portion_v2,portion IN (0.25,0.5,1,1.5,2)"`
	SharedMeal bool          `gorm:"column:shared_meal;not null"`
	// ShareFriends: friends may see this meal (feed, friend's day). Off unless the user turned it on.
	ShareFriends bool      `gorm:"column:share_friends;not null;default:false"`
	Cheat        bool      `gorm:"column:cheat;not null"`
	LoggedAt     time.Time `gorm:"column:logged_at;not null"`

	Items []ai.Item      `gorm:"-"` // rows of meal_items, filled by loadItems
	User  *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Log) TableName() string { return "meal_logs" }

// ItemRow is one recognized food of a meal (table meal_items), in display order.
type ItemRow struct {
	ID        uint   `gorm:"primaryKey;autoIncrement"`
	MealLogID string `gorm:"column:meal_log_id;size:36;not null;uniqueIndex:ux_meal_item_pos,priority:1"`
	Position  int    `gorm:"column:position;not null;uniqueIndex:ux_meal_item_pos,priority:2"`
	Name      string `gorm:"column:name;not null"`
	Amount    string `gorm:"column:amount;not null"`
	// One food's own estimate (null when the user typed the food in). The meal's totals stay on meal_logs.
	Kcal *int `gorm:"column:kcal"`
	// Portion: how much of this food was eaten (0.25~2, null = all of it). The meal's totals already include it.
	Portion *float64 `gorm:"column:portion"`
	Carbs   *int     `gorm:"column:carbs"`
	Protein *int     `gorm:"column:protein"`
	Fat     *int     `gorm:"column:fat"`

	MealLog *Log `gorm:"foreignKey:MealLogID;references:ID;constraint:OnDelete:CASCADE"`
}

func (ItemRow) TableName() string { return "meal_items" }

// Models lists the tables of this package for AutoMigrate (parents first).
func Models() []any { return []any{&Log{}, &ItemRow{}} }

// loadItems fills Items of the given logs with one query.
func loadItems(db *gorm.DB, logs []Log) error {
	if len(logs) == 0 {
		return nil
	}
	ids := make([]string, len(logs))
	pos := map[string]int{}
	for i, l := range logs {
		ids[i] = l.ID
		pos[l.ID] = i
		logs[i].Items = []ai.Item{}
	}
	var rows []ItemRow
	if err := db.Where("meal_log_id IN ?", ids).Order("meal_log_id, position").Find(&rows).Error; err != nil {
		return err
	}
	for _, r := range rows {
		i := pos[r.MealLogID]
		logs[i].Items = append(logs[i].Items, ai.Item{Name: r.Name, Amount: r.Amount,
			Kcal: r.Kcal, Carbs: r.Carbs, Protein: r.Protein, Fat: r.Fat, Portion: r.Portion})
	}
	return nil
}

// ViewsByDate is the meals of one day as views (shared with the sync snapshot).
func ViewsByDate(db *gorm.DB, userID string, date platform.Date) ([]View, error) {
	return views(db.Where("user_id = ? AND meal_date = ?", userID, date), db)
}

// ViewsAll is every meal of a user, oldest first.
func ViewsAll(db *gorm.DB, userID string) ([]View, error) {
	return views(db.Where("user_id = ?", userID), db)
}

func views(q, db *gorm.DB) ([]View, error) {
	var ms []Log
	if err := q.Order("meal_date, meal_index").Find(&ms).Error; err != nil {
		return nil, err
	}
	if err := loadItems(db, ms); err != nil {
		return nil, err
	}
	out := make([]View, 0, len(ms))
	for _, m := range ms {
		out = append(out, ViewOf(m))
	}
	return out, nil
}

// Portions are the allowed multipliers of the recognised serving (what was eaten).
var Portions = []float64{0.25, 0.5, 1, 1.5, 2}

// Factor converts to what was actually eaten; a shared meal counts half.
func (m Log) Factor() float64 {
	if m.SharedMeal {
		return m.Portion * 0.5
	}
	return m.Portion
}

// Nutrition is kcal and macros scaled to what was eaten (shown with "약" and rounded in the UI).
type Nutrition struct {
	Kcal    int `json:"kcal"`
	Carbs   int `json:"carbs"`
	Protein int `json:"protein"`
	Fat     int `json:"fat"`
}

func round(x float64) int { return int(math.Floor(x + 0.5)) }

func NutritionOf(m Log) Nutrition {
	f := m.Factor()
	return Nutrition{round(float64(m.Kcal) * f), round(float64(m.Carbs) * f),
		round(float64(m.Protein) * f), round(float64(m.Fat) * f)}
}

func (n Nutrition) Plus(o Nutrition) Nutrition {
	return Nutrition{n.Kcal + o.Kcal, n.Carbs + o.Carbs, n.Protein + o.Protein, n.Fat + o.Fat}
}

type View struct {
	ID           string        `json:"id"`
	Date         platform.Date `json:"date"`
	Index        int           `json:"index"`
	Deadline     string        `json:"deadline"`
	Barcode      *string       `json:"barcode"`
	Items        []ai.Item     `json:"items"`
	Nutrition    Nutrition     `json:"nutrition"`
	Base         Nutrition     `json:"base"` // as stored (one serving, before portion/sharing); a restoring phone needs it exactly
	Portion      float64       `json:"portion"`
	SharedMeal   bool          `json:"sharedMeal"`
	ShareFriends bool          `json:"shareFriends"`
	Cheat        bool          `json:"cheat"`
	Confidence   float64       `json:"confidence"`
	LoggedAt     time.Time     `json:"loggedAt"`
}

func ViewOf(m Log) View {
	items := m.Items
	if items == nil {
		items = []ai.Item{}
	}
	return View{m.ID, m.Date, m.Index, m.Deadline, m.Barcode, items, NutritionOf(m),
		Nutrition{m.Kcal, m.Carbs, m.Protein, m.Fat}, m.Portion,
		m.SharedMeal, m.ShareFriends, m.Cheat, m.Confidence, m.LoggedAt}
}

type Request struct {
	Date         platform.Date `json:"date"`
	Index        int           `json:"index"`
	Deadline     *string       `json:"deadline"`
	Barcode      *string       `json:"barcode"`
	AI           *ai.Result    `json:"ai"`
	Portion      float64       `json:"portion"` // 0.25 · 0.5 · 1 · 1.5 · 2 (more than one serving: AI often misses a large bowl)
	SharedMeal   bool          `json:"sharedMeal"`
	ShareFriends bool          `json:"shareFriends"` // show this meal to friends
	Cheat        bool          `json:"cheat"`        // picked as a cheat meal (spicy mode)
	LoggedAt     *time.Time    `json:"loggedAt"`
}

// Meal numbers: 1~6 are the planned meals (meal slots with deadlines); ExtraBase~MaxIndex are "기타" (a snack or
// anything outside the plan) — no deadline, never locked, not counted as a planned meal, but eaten (in totals).
const (
	MaxSlot   = 6
	ExtraBase = 7
	MaxIndex  = 9
)

// IsExtra: a "기타" entry, not one of the planned meals.
func IsExtra(index int) bool { return index >= ExtraBase }

// Label is how a meal number reads: "2끼", or "기타 1" for the extras.
func Label(index int) string {
	if IsExtra(index) {
		return fmt.Sprintf("기타 %d", index-ExtraBase+1)
	}
	return fmt.Sprintf("%d끼", index)
}

func (r *Request) Validate() error {
	switch {
	case r.Date.IsZero():
		return platform.Invalid("date", "필수예요")
	case r.Index < 1 || r.Index > MaxIndex:
		return platform.Invalid("index", "1~9 사이여야 해요 (7~9는 기타)")
	case r.Deadline != nil && !settings.ValidHHMM(*r.Deadline):
		return platform.Invalid("deadline", "HH:mm 형식이어야 해요")
	case r.AI == nil:
		return platform.Invalid("ai", "필수예요")
	}
	return r.AI.Validate("ai")
}

type Logged struct {
	Meal      View `json:"meal"`
	CheatLeft int  `json:"cheatLeft"`
}

// Deps are the services a meal log touches. They are rebuilt on a transaction handle so that the
// meal, its items, the cheat coupon and the lock release commit or roll back together.
type Deps struct {
	Settings *settings.Service
	Coupons  *coupon.Service
	Locks    *lock.Service
}

type Service struct {
	db    *gorm.DB
	deps  func(*gorm.DB) Deps
	clock platform.Clock
	// OnDelete runs after a meal is deleted (its backed-up photo goes with it).
	OnDelete func(userID string, date platform.Date, index int) error
}

func NewService(db *gorm.DB, deps func(*gorm.DB) Deps, clock platform.Clock) *Service {
	return &Service{db: db, deps: deps, clock: clock}
}

// Log stores a meal (overwriting the same slot) and releases an open meal lock.
//
// Cheat coupon (spicy mode): a meal picked as cheat, or above twice the per-meal target, spends one
// cheat coupon. With no coupon left the meal is still recorded and nothing is locked:
// exceeding calories is never punished.
func (s *Service) Log(userID string, r Request) (Logged, error) {
	if err := r.Validate(); err != nil {
		return Logged{}, err
	}
	var out Logged
	err := s.db.Transaction(func(tx *gorm.DB) (err error) {
		out, err = s.log(tx, s.deps(tx), userID, r)
		return err
	})
	return out, err
}

func (s *Service) log(tx *gorm.DB, d Deps, userID string, r Request) (Logged, error) {
	st, err := d.Settings.Current(userID)
	if err != nil {
		return Logged{}, err
	}
	extra := IsExtra(r.Index)
	if !extra && r.Index > len(st.Meals) {
		return Logged{}, platform.BadRequest("INVALID", fmt.Sprintf("설정한 끼니 수(%d)보다 큰 번호예요", len(st.Meals)))
	}
	if !slices.Contains(Portions, r.Portion) {
		return Logged{}, platform.BadRequest("INVALID", "먹은 양은 0.25, 0.5, 1, 1.5, 2 중 하나예요")
	}
	var m Log
	err = tx.Where("user_id = ? AND meal_date = ? AND meal_index = ?", userID, r.Date, r.Index).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		m = Log{ID: uuid.NewString()}
	} else if err != nil {
		return Logged{}, err
	}
	wasCheat := m.Cheat
	m.UserID, m.Date, m.Index = userID, r.Date, r.Index
	m.Deadline = "" // "기타" has no deadline
	if !extra {
		m.Deadline = st.Meals[r.Index-1].Deadline
	}
	for _, slot := range st.Meals {
		if slot.Index == r.Index {
			m.Deadline = slot.Deadline
		}
	}
	if r.Deadline != nil {
		m.Deadline = *r.Deadline
	}
	m.Barcode = r.Barcode
	m.Items = r.AI.Items
	m.Kcal, m.Carbs, m.Protein, m.Fat, m.Confidence = r.AI.Kcal, r.AI.Carbs, r.AI.Protein, r.AI.Fat, r.AI.Confidence
	m.Portion, m.SharedMeal, m.ShareFriends = r.Portion, r.SharedMeal, r.ShareFriends
	m.LoggedAt = s.clock.Now()
	if r.LoggedAt != nil {
		m.LoggedAt = r.LoggedAt.UTC()
	}
	m.Cheat = !extra && st.Mode == settings.ModeSpicy &&
		(r.Cheat || NutritionOf(m).Kcal > 2*st.Targets.PerMeal(len(st.Meals)).Kcal)
	if err := tx.Omit("User").Save(&m).Error; err != nil {
		return Logged{}, err
	}
	if err := tx.Where("meal_log_id = ?", m.ID).Delete(&ItemRow{}).Error; err != nil {
		return Logged{}, err
	}
	if len(m.Items) > 0 {
		rows := make([]ItemRow, len(m.Items))
		for i, it := range m.Items {
			rows[i] = ItemRow{MealLogID: m.ID, Position: i, Name: it.Name, Amount: it.Amount,
				Kcal: it.Kcal, Carbs: it.Carbs, Protein: it.Protein, Fat: it.Fat, Portion: it.Portion}
		}
		if err := tx.Omit("MealLog").Create(&rows).Error; err != nil {
			return Logged{}, err
		}
	}
	if m.Cheat && !wasCheat {
		if _, err := d.Coupons.TryConsume(userID, coupon.Cheat, r.Date); err != nil {
			return Logged{}, err
		}
	}
	// a planned meal releases a meal lock; "기타" (a snack) does not
	if !extra {
		if err := d.Locks.ReleaseOpen(userID, lock.Meal); err != nil {
			return Logged{}, err
		}
	}
	sum, err := d.Coupons.Summary(userID, r.Date)
	if err != nil {
		return Logged{}, err
	}
	return Logged{ViewOf(m), sum.Cheat.Left}, nil
}

func (s *Service) ByDate(userID string, date platform.Date) ([]View, error) {
	return ViewsByDate(s.db, userID, date)
}

func (s *Service) Delete(userID string, date platform.Date, index int) error {
	if err := s.db.Where("user_id = ? AND meal_date = ? AND meal_index = ?", userID, date, index).Delete(&Log{}).Error; err != nil {
		return err
	}
	if s.OnDelete != nil {
		return s.OnDelete(userID, date, index)
	}
	return nil
}
