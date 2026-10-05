package stats

import (
	"net/http"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	// Home: totals, meal table, streak, this week's gym, coupons.
	mux.HandleFunc("GET /api/today", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		out, err := svc.Today(dev, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	// Records tab calendar: month=2026-09.
	mux.HandleFunc("GET /api/records/month", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		out, err := svc.Month(dev, r.URL.Query().Get("month"))
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	// Day card for the tapped day.
	mux.HandleFunc("GET /api/records/day", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		out, err := svc.Day(dev, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	// Weekly graph on home: this week vs last week per weekday. date = the device's local today.
	mux.HandleFunc("GET /api/stats/weekly", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		out, err := svc.Weekly(dev, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
}
