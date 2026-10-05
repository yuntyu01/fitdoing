package gym

import (
	"net/http"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("POST /api/gym/check-in", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		var b struct {
			Date       platform.Date `json:"date"`
			VerifiedBy Verified      `json:"verifiedBy"`
			CheckInAt  *time.Time    `json:"checkInAt"`
		}
		if err := platform.Decode(w, r, &b); err != nil {
			return err
		}
		if b.Date.IsZero() {
			return platform.Invalid("date", "필수예요")
		}
		if b.VerifiedBy == "" {
			return platform.Invalid("verifiedBy", "필수예요")
		}
		if b.VerifiedBy == Rest {
			return platform.BadRequest("INVALID", "휴식은 /api/coupons/rest 로 처리해요")
		}
		g, err := svc.CheckIn(dev, b.Date, b.VerifiedBy, b.CheckInAt)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, struct {
			Date       platform.Date `json:"date"`
			VerifiedBy Verified      `json:"verifiedBy"`
			CheckInAt  *time.Time    `json:"checkInAt"`
		}{g.Date, g.VerifiedBy, g.CheckInAt})
		return nil
	}))
	mux.HandleFunc("POST /api/sleep", platform.WithDevice(func(w http.ResponseWriter, r *http.Request, dev string) error {
		var b struct {
			Date       platform.Date `json:"date"`
			LockedAt   *time.Time    `json:"lockedAt"`
			UnlockedAt *time.Time    `json:"unlockedAt"`
		}
		if err := platform.Decode(w, r, &b); err != nil {
			return err
		}
		if b.Date.IsZero() {
			return platform.Invalid("date", "필수예요")
		}
		l, err := svc.Sleep(dev, b.Date, b.LockedAt, b.UnlockedAt)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, l) // SleepLog hides deviceId
		return nil
	}))
}
