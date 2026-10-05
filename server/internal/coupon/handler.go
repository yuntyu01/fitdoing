package coupon

import (
	"net/http"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("GET /api/coupons", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		sum, err := svc.Summary(dev, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, sum)
		return nil
	}))
	// Skip today's gym with a rest coupon.
	mux.HandleFunc("POST /api/coupons/rest", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		sum, err := svc.RestSummary(dev, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, sum)
		return nil
	}))
}
