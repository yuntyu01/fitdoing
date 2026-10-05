package lock

import (
	"net/http"
	"strconv"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("POST /api/locks", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		var b struct {
			Type      Type          `json:"type"`
			Date      platform.Date `json:"date"`
			StartedAt *time.Time    `json:"startedAt"`
		}
		if err := platform.Decode(w, r, &b); err != nil {
			return err
		}
		if b.Type == "" {
			return platform.Invalid("type", "필수예요")
		}
		if b.Date.IsZero() {
			return platform.Invalid("date", "필수예요")
		}
		e, err := svc.Start(dev, b.Type, b.Date, b.StartedAt)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, e)
		return nil
	}))
	mux.HandleFunc("POST /api/locks/{id}/release", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		id, err := strconv.ParseUint(r.PathValue("id"), 10, 64)
		if err != nil {
			return platform.Invalid("id", "숫자여야 해요")
		}
		var b struct {
			By   ReleasedBy    `json:"by"`
			Date platform.Date `json:"date"`
		}
		if err := platform.Decode(w, r, &b); err != nil {
			return err
		}
		if b.By == "" {
			return platform.Invalid("by", "필수예요")
		}
		if b.Date.IsZero() {
			return platform.Invalid("date", "필수예요")
		}
		e, err := svc.Release(dev, uint(id), b.By, b.Date)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, e)
		return nil
	}))
}
