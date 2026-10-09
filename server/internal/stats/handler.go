package stats

import (
	"net/http"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
)

func Register(mux *http.ServeMux, svc *Service) {
	// Home: totals, meal table, streak, this week's gym, coupons.
	mux.HandleFunc("GET /api/today", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		now := r.URL.Query().Get("time") // device-local "HH:mm"; optional
		if now != "" && !settings.ValidHHMM(now) {
			return platform.Invalid("time", "HH:mm 형식이어야 해요")
		}
		out, err := svc.Today(uid, date, now)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	// Records tab calendar: month=2026-09.
	mux.HandleFunc("GET /api/records/month", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		out, err := svc.Month(uid, r.URL.Query().Get("month"))
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	// Day card for the tapped day.
	mux.HandleFunc("GET /api/records/day", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		out, err := svc.Day(uid, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	// Weekly graph on home: this week vs last week per weekday. date = the user's local today.
	mux.HandleFunc("GET /api/stats/weekly", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		out, err := svc.Weekly(uid, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
}
