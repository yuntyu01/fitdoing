// Package api wires services, routes and middleware into one http.Handler.
package api

import (
	"context"
	"net/http"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/admin"
	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/appsync"
	"github.com/yuntyu01/fitdoing/server/internal/auth"
	"github.com/yuntyu01/fitdoing/server/internal/coupon"
	"github.com/yuntyu01/fitdoing/server/internal/foods"
	"github.com/yuntyu01/fitdoing/server/internal/friends"
	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/photo"
	"github.com/yuntyu01/fitdoing/server/internal/places"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"github.com/yuntyu01/fitdoing/server/internal/share"
	"github.com/yuntyu01/fitdoing/server/internal/stats"
	"gorm.io/gorm"
)

// Options are the optional parts of the server.
type Options struct {
	AuthDisabled bool        // AUTH_DISABLED=1: every token is the dev user (development only)
	PhotoStore   photo.Store // nil: photo backup answers 503 PHOTO_BACKUP_UNAVAILABLE
	PublicURL    string      // PUBLIC_BASE_URL: base of the public share page links ("" = from the request)
	// AIModels: the analyzer per allowed model (GEMINI_MODEL default + GEMINI_MODELS). nil = only the analyzer
	// given to New, as the default model.
	AIModels      *ai.ModelSet
	AdminPassword string           // ADMIN_PASSWORD: enables /admin and /api/admin/* ("" = off)
	Places        *places.Searcher // gym place search; nil = off (503)
	Foods         *foods.Lookup    // barcode lookup; nil = off (503)
	Now           func() time.Time // admin session clock (tests); nil = time.Now
}

// New builds the full HTTP handler (routes + CORS + request logging).
func New(db *gorm.DB, analyzer ai.FoodAnalyzer, clock platform.Clock, corsOrigins []string, authSvc *auth.Service, opts ...Options) http.Handler {
	var o Options
	if len(opts) > 0 {
		o = opts[0]
	}
	resolve := authSvc.Resolve
	if o.AuthDisabled {
		resolve = authSvc.ResolveTransition
	}
	// core builds the mutually dependent services on one DB handle, so a transaction can get its own set.
	core := func(h *gorm.DB) (*settings.Service, *lock.Service, *gym.Service, *coupon.Service) {
		st := settings.NewService(h, clock)
		lk := lock.NewService(h, clock)
		gy := gym.NewService(h, lk, clock)
		cp := coupon.NewService(h, st, gy, clock)
		lk.SetCoupons(cp)
		return st, lk, gy, cp
	}
	settingsSvc, lockSvc, gymSvc, couponSvc := core(db)
	mealSvc := meal.NewService(db, func(h *gorm.DB) meal.Deps {
		st, lk, _, cp := core(h)
		return meal.Deps{Settings: st, Locks: lk, Coupons: cp}
	}, clock)
	statsSvc := stats.NewService(db, settingsSvc, couponSvc, mealSvc)
	syncSvc := appsync.NewService(db, func(h *gorm.DB) *settings.Service { st, _, _, _ := core(h); return st })
	// Photo backup: a meal's photo goes with the meal, every photo with the account.
	photoSvc := photo.NewService(db, o.PhotoStore)
	mealSvc.OnDelete = func(uid string, d platform.Date, i int) error {
		return photoSvc.Delete(context.Background(), uid, d, i)
	}
	authSvc.BeforeDelete = []func(string) error{func(uid string) error { return photoSvc.DeleteAll(context.Background(), uid) }}
	syncSvc.Photos = photoSvc.Refs

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		platform.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	settings.Register(mux, settingsSvc)
	auth.Register(mux, authSvc, o.AuthDisabled)
	models := o.AIModels
	if models == nil {
		models = ai.SingleModel(db, "default", analyzer)
	}
	ai.Register(mux, models)
	admin.Register(mux, db, o.AdminPassword, models, o.Now)
	searcher := o.Places
	if searcher == nil {
		searcher = places.New("", "")
	}
	places.Register(mux, searcher)
	lookup := o.Foods
	if lookup == nil {
		lookup = foods.New("", "", "", "")
	}
	foods.Register(mux, lookup)
	meal.Register(mux, mealSvc)
	lock.Register(mux, lockSvc)
	coupon.Register(mux, couponSvc)
	gym.Register(mux, gymSvc)
	stats.Register(mux, statsSvc)
	appsync.Register(mux, syncSvc)
	photo.Register(mux, photoSvc)
	friends.Register(mux, friends.NewService(db, photoSvc))
	share.Register(mux, share.NewService(db, photoSvc, clock, o.PublicURL))

	return platform.Logging(platform.CORS(corsOrigins)(platform.Authenticate(resolve)(mux)))
}
