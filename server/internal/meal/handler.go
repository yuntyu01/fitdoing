package meal

import (
	"net/http"
	"strconv"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("POST /api/meals", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		var req Request
		if err := platform.Decode(w, r, &req); err != nil {
			return err
		}
		out, err := svc.Log(dev, req)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	mux.HandleFunc("GET /api/meals", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		out, err := svc.ByDate(dev, date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, out)
		return nil
	}))
	mux.HandleFunc("DELETE /api/meals", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		date, err := platform.QueryDate(r, "date")
		if err != nil {
			return err
		}
		idx, err := strconv.Atoi(r.URL.Query().Get("index"))
		if err != nil {
			return platform.Invalid("index", "숫자여야 해요")
		}
		if err := svc.Delete(dev, date, idx); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
}
