package coupon

import (
	"net/http"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("GET /api/coupons", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		sum, err := svc.Summary(uid, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, sum)
		return nil
	}))
	// Skip today's gym with a rest coupon.
	mux.HandleFunc("POST /api/coupons/rest", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		sum, err := svc.RestSummary(uid, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, sum)
		return nil
	}))
}
