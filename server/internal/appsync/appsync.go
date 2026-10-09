// Package appsync is the app <-> server synchronization: events pushed by the phone (idempotent
// upserts, one transaction per request) and a full snapshot for restoring a phone.
// The phone is the source of truth, so no rules (coupon balance, emergency limit ...) are re-checked.
package appsync

import (
	"errors"
	"net/http"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/coupon"
	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/photo"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"gorm.io/gorm"
)

// Ms is an epoch-milliseconds timestamp on the wire.
type Ms = int64

type GymLogIn struct {
	Date       platform.Date `json:"date"`
	VerifiedBy string        `json:"verifiedBy"`
	CheckInAt  *Ms           `json:"checkInAt"`
}

type SleepLogIn struct {
	Date       platform.Date `json:"date"`
	LockedAt   *Ms           `json:"lockedAt"`
	UnlockedAt *Ms           `json:"unlockedAt"`
}

type LockEventIn struct {
	Type       string        `json:"type"`
	Date       platform.Date `json:"date"`
	StartedAt  *Ms           `json:"startedAt"`
	EndedAt    *Ms           `json:"endedAt"`
	ReleasedBy *string       `json:"releasedBy"`
	Reason     *string       `json:"reason"` // 비상 해제 사유 (선택, 100자 이하)
}

type CouponUseIn struct {
	Type    string        `json:"type"`
	UsedAt  *Ms           `json:"usedAt"`
	WeekKey platform.Date `json:"weekKey"`
}

// Events is the body of POST /api/sync/events (and the event part of the snapshot).
type Events struct {
	GymLogs    []GymLogIn    `json:"gymLogs"`
	SleepLogs  []SleepLogIn  `json:"sleepLogs"`
	LockEvents []LockEventIn `json:"lockEvents"`
	CouponUses []CouponUseIn `json:"couponUses"`
}

// Counts is the number of items processed per kind.
type Counts struct {
	GymLogs    int `json:"gymLogs"`
	SleepLogs  int `json:"sleepLogs"`
	LockEvents int `json:"lockEvents"`
	CouponUses int `json:"couponUses"`
}

// Snapshot is everything stored for a user, in the shape of the sync events.
type Snapshot struct {
	Settings   *settings.Settings `json:"settings"`
	Meals      []meal.View        `json:"meals"`
	GymLogs    []GymLogIn         `json:"gymLogs"`
	SleepLogs  []SleepLogIn       `json:"sleepLogs"`
	LockEvents []LockEventIn      `json:"lockEvents"`
	CouponUses []CouponUseIn      `json:"couponUses"`
	Photos     []photo.Ref        `json:"photos"` // meals with a backed-up photo (GET /api/meals/photo)
}

type Service struct {
	db       *gorm.DB
	settings func(*gorm.DB) *settings.Service
	// Photos lists backed-up meal photos for the snapshot (nil: none).
	Photos func(userID string) ([]photo.Ref, error)
}

func NewService(db *gorm.DB, st func(*gorm.DB) *settings.Service) *Service {
	return &Service{db: db, settings: st}
}

func ms(t time.Time) *Ms { v := t.UnixMilli(); return &v }

func ptrTime(v *Ms) *time.Time {
	if v == nil {
		return nil
	}
	t := time.UnixMilli(*v).UTC()
	return &t
}

func needMs(field string, v *Ms) (time.Time, error) {
	if v == nil || *v <= 0 {
		return time.Time{}, platform.Invalid(field, "epoch ms 숫자여야 해요")
	}
	return time.UnixMilli(*v).UTC(), nil
}

func optMs(field string, v *Ms) (*time.Time, error) {
	if v != nil && *v <= 0 {
		return nil, platform.Invalid(field, "epoch ms 숫자여야 해요")
	}
	return ptrTime(v), nil
}

func oneOf(field, v string, allowed ...string) error {
	for _, a := range allowed {
		if a == v {
			return nil
		}
	}
	return platform.Invalid(field, "허용되지 않는 값이에요")
}

func needDate(field string, d platform.Date) error {
	if d.IsZero() {
		return platform.Invalid(field, "YYYY-MM-DD 형식이어야 해요")
	}
	return nil
}

// Push applies the events in one transaction. Items are validated as they are applied, so one bad
// item rolls back the whole request.
func (s *Service) Push(userID string, in Events) (Counts, error) {
	var c Counts
	err := s.db.Transaction(func(tx *gorm.DB) error {
		for i, g := range in.GymLogs {
			if err := upsertGym(tx, userID, g); err != nil {
				return err
			}
			c.GymLogs = i + 1
		}
		for i, l := range in.SleepLogs {
			if err := upsertSleep(tx, userID, l); err != nil {
				return err
			}
			c.SleepLogs = i + 1
		}
		for i, e := range in.LockEvents {
			if err := upsertLock(tx, userID, e); err != nil {
				return err
			}
			c.LockEvents = i + 1
		}
		for i, u := range in.CouponUses {
			if err := insertCoupon(tx, userID, u); err != nil {
				return err
			}
			c.CouponUses = i + 1
		}
		return nil
	})
	if err != nil {
		return Counts{}, err
	}
	return c, nil
}

func upsertGym(tx *gorm.DB, uid string, in GymLogIn) error {
	if err := needDate("gymLogs.date", in.Date); err != nil {
		return err
	}
	if err := oneOf("gymLogs.verifiedBy", in.VerifiedBy, "geofence", "photo", "rest"); err != nil {
		return err
	}
	at, err := optMs("gymLogs.checkInAt", in.CheckInAt)
	if err != nil {
		return err
	}
	var g gym.Log
	err = tx.Where("user_id = ? AND gym_date = ?", uid, in.Date).First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		g = gym.Log{UserID: uid, Date: in.Date}
	} else if err != nil {
		return err
	}
	g.VerifiedBy, g.CheckInAt = gym.Verified(in.VerifiedBy), at
	return tx.Omit("User").Save(&g).Error
}

func upsertSleep(tx *gorm.DB, uid string, in SleepLogIn) error {
	if err := needDate("sleepLogs.date", in.Date); err != nil {
		return err
	}
	locked, err := optMs("sleepLogs.lockedAt", in.LockedAt)
	if err != nil {
		return err
	}
	unlocked, err := optMs("sleepLogs.unlockedAt", in.UnlockedAt)
	if err != nil {
		return err
	}
	var l gym.SleepLog
	err = tx.Where("user_id = ? AND sleep_date = ?", uid, in.Date).First(&l).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		l = gym.SleepLog{UserID: uid, Date: in.Date}
	} else if err != nil {
		return err
	}
	if locked != nil { // null never erases an existing value
		l.LockedAt = locked
	}
	if unlocked != nil {
		l.UnlockedAt = unlocked
	}
	return tx.Omit("User").Save(&l).Error
}

func upsertLock(tx *gorm.DB, uid string, in LockEventIn) error {
	if err := oneOf("lockEvents.type", in.Type, "meal", "gym", "sleep"); err != nil {
		return err
	}
	if err := needDate("lockEvents.date", in.Date); err != nil {
		return err
	}
	started, err := needMs("lockEvents.startedAt", in.StartedAt)
	if err != nil {
		return err
	}
	ended, err := optMs("lockEvents.endedAt", in.EndedAt)
	if err != nil {
		return err
	}
	var by *lock.ReleasedBy
	if in.ReleasedBy != nil {
		if err := oneOf("lockEvents.releasedBy", *in.ReleasedBy, "action", "time", "emergency", "coupon"); err != nil {
			return err
		}
		v := lock.ReleasedBy(*in.ReleasedBy)
		by = &v
	}
	if in.Reason != nil && len([]rune(*in.Reason)) > 100 {
		return platform.Invalid("lockEvents.reason", "100자 이하여야 해요")
	}
	var e lock.Event
	err = tx.Where("user_id = ? AND type = ? AND started_at = ?", uid, in.Type, started).First(&e).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		e = lock.Event{UserID: uid, Type: lock.Type(in.Type), Date: in.Date, StartedAt: started}
	} else if err != nil {
		return err
	}
	if ended != nil { // an old replay with a still-open lock never reopens an ended one
		e.EndedAt = ended
	}
	if by != nil {
		e.ReleasedBy = by
	}
	if in.Reason != nil && *in.Reason != "" {
		e.Reason = in.Reason
	}
	return tx.Omit("User").Save(&e).Error
}

func insertCoupon(tx *gorm.DB, uid string, in CouponUseIn) error {
	if err := oneOf("couponUses.type", in.Type, "rest", "cheat", "emergency"); err != nil {
		return err
	}
	if err := needDate("couponUses.weekKey", in.WeekKey); err != nil {
		return err
	}
	used, err := needMs("couponUses.usedAt", in.UsedAt)
	if err != nil {
		return err
	}
	var n int64
	if err := tx.Model(&coupon.Use{}).Where("user_id = ? AND type = ? AND used_at = ?", uid, in.Type, used).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	u := coupon.Use{UserID: uid, Type: coupon.Type(in.Type), UsedAt: used, WeekKey: in.WeekKey}
	return tx.Omit("User").Create(&u).Error
}

// Snapshot reads everything of a user in one transaction. settings is nil when none was ever stored.
func (s *Service) Snapshot(userID string) (Snapshot, error) {
	out := Snapshot{GymLogs: []GymLogIn{}, SleepLogs: []SleepLogIn{}, LockEvents: []LockEventIn{}, CouponUses: []CouponUseIn{},
		Photos: []photo.Ref{}}
	if s.Photos != nil {
		refs, err := s.Photos(userID)
		if err != nil {
			return out, err
		}
		out.Photos = refs
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		st := s.settings(tx)
		ok, err := st.Exists(userID)
		if err != nil {
			return err
		}
		if ok {
			v, err := st.Get(userID)
			if err != nil {
				return err
			}
			out.Settings = &v.Settings
		}
		if out.Meals, err = meal.ViewsAll(tx, userID); err != nil {
			return err
		}
		var gs []gym.Log
		if err := tx.Where("user_id = ?", userID).Order("gym_date").Find(&gs).Error; err != nil {
			return err
		}
		for _, g := range gs {
			in := GymLogIn{Date: g.Date, VerifiedBy: string(g.VerifiedBy)}
			if g.CheckInAt != nil {
				in.CheckInAt = ms(*g.CheckInAt)
			}
			out.GymLogs = append(out.GymLogs, in)
		}
		var ss []gym.SleepLog
		if err := tx.Where("user_id = ?", userID).Order("sleep_date").Find(&ss).Error; err != nil {
			return err
		}
		for _, l := range ss {
			in := SleepLogIn{Date: l.Date}
			if l.LockedAt != nil {
				in.LockedAt = ms(*l.LockedAt)
			}
			if l.UnlockedAt != nil {
				in.UnlockedAt = ms(*l.UnlockedAt)
			}
			out.SleepLogs = append(out.SleepLogs, in)
		}
		var es []lock.Event
		if err := tx.Where("user_id = ?", userID).Order("started_at").Find(&es).Error; err != nil {
			return err
		}
		for _, e := range es {
			in := LockEventIn{Type: string(e.Type), Date: e.Date, StartedAt: ms(e.StartedAt)}
			if e.EndedAt != nil {
				in.EndedAt = ms(*e.EndedAt)
			}
			if e.ReleasedBy != nil {
				v := string(*e.ReleasedBy)
				in.ReleasedBy = &v
			}
			in.Reason = e.Reason
			out.LockEvents = append(out.LockEvents, in)
		}
		var us []coupon.Use
		if err := tx.Where("user_id = ?", userID).Order("used_at, id").Find(&us).Error; err != nil {
			return err
		}
		for _, u := range us {
			out.CouponUses = append(out.CouponUses, CouponUseIn{Type: string(u.Type), UsedAt: ms(u.UsedAt), WeekKey: u.WeekKey})
		}
		return nil
	})
	return out, err
}

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("POST /api/sync/events", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		var in Events
		if err := platform.Decode(w, r, &in); err != nil {
			return err
		}
		c, err := svc.Push(uid, in)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, c)
		return nil
	}))
	mux.HandleFunc("GET /api/sync/snapshot", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		v, err := svc.Snapshot(uid)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, v)
		return nil
	}))
}
