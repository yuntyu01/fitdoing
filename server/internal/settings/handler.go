package settings

import (
	"net/http"
	"strconv"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("GET /api/settings", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		v, err := svc.Get(uid)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, v)
		return nil
	}))
	mux.HandleFunc("PUT /api/settings", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		var in Settings
		if err := platform.Decode(w, r, &in); err != nil {
			return err
		}
		v, err := svc.Put(uid, in)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, v)
		return nil
	}))
	// Backup of the phone's settings as they are (the local copy is the truth).
	mux.HandleFunc("PUT /api/sync/settings", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		var in Settings
		if err := platform.Decode(w, r, &in); err != nil {
			return err
		}
		v, err := svc.Backup(uid, in)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, v)
		return nil
	}))
	// Recommends targets from goal and weight; the user can edit them freely (>= 1200 kcal).
	mux.HandleFunc("GET /api/targets/recommend", platform.Handle(func(w http.ResponseWriter, r *http.Request) error {
		goal, err := ParseGoal(r.URL.Query().Get("goal"))
		if err != nil {
			return err
		}
		kg, err := strconv.ParseFloat(r.URL.Query().Get("weightKg"), 64)
		if err != nil {
			return platform.Invalid("weightKg", "숫자여야 해요")
		}
		platform.JSON(w, http.StatusOK, Recommend(goal, kg))
		return nil
	}))
}
