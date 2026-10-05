// Package api wires services, routes and middleware into one http.Handler.
package api

import (
	"net/http"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/appsync"
	"github.com/yuntyu01/fitdoing/server/internal/coupon"
	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"github.com/yuntyu01/fitdoing/server/internal/stats"
	"gorm.io/gorm"
)

// New builds the full HTTP handler (routes + CORS + request logging).
func New(db *gorm.DB, analyzer ai.FoodAnalyzer, clock platform.Clock, corsOrigins []string) http.Handler {
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

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		platform.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	settings.Register(mux, settingsSvc)
	ai.Register(mux, analyzer)
	meal.Register(mux, mealSvc)
	lock.Register(mux, lockSvc)
	coupon.Register(mux, couponSvc)
	gym.Register(mux, gymSvc)
	stats.Register(mux, statsSvc)
	appsync.Register(mux, syncSvc)

	return platform.Logging(platform.CORS(corsOrigins)(mux))
}
