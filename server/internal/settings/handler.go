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
	// Recommends targets. No login needed; the user can edit the result freely (>= 1200 kcal).
	//  - legacy request (goal, weightKg only): the old weight-based answer, unchanged for older apps.
	//  - with heightCm, age, sex, activity: 2025 KDRI adult EER, app starting values (see RecommendEER).
	mux.HandleFunc("GET /api/targets/recommend", platform.Handle(func(w http.ResponseWriter, r *http.Request) error {
		q := r.URL.Query()
		goal, err := ParseGoal(q.Get("goal"))
		if err != nil {
			return err
		}
		kg, err := strconv.ParseFloat(q.Get("weightKg"), 64)
		if err != nil || kg <= 0 {
			return platform.Invalid("weightKg", "숫자여야 해요")
		}
		body := []string{"heightCm", "age", "sex", "activity"}
		given := 0
		for _, k := range body {
			if q.Has(k) {
				given++
			}
		}
		if given == 0 {
			if goal == GoalBulk {
				return platform.Invalid("goal", "bulk 는 heightCm·age·sex·activity 와 함께 요청해야 해요")
			}
			platform.JSON(w, http.StatusOK, Recommend(goal, kg))
			return nil
		}
		if given < len(body) {
			return platform.Invalid("body", "heightCm, age, sex, activity 를 모두 보내야 해요")
		}
		cm, err := strconv.ParseFloat(q.Get("heightCm"), 64)
		if err != nil || cm < 100 || cm > 250 {
			return platform.Invalid("heightCm", "100~250 사이 숫자여야 해요")
		}
		age, err := strconv.Atoi(q.Get("age"))
		if err != nil || !between(age, AgeMin, AgeMax) {
			return platform.Invalid("age", "10~100 사이 정수여야 해요")
		}
		var sex Sex
		if err := sex.UnmarshalJSON([]byte(strconv.Quote(q.Get("sex")))); err != nil || sex == "" {
			return platform.Invalid("sex", "male, female 중 하나예요")
		}
		act, ok := ParseActivity(q.Get("activity"))
		if !ok {
			return platform.Invalid("activity", "sedentary, low, active, veryActive 중 하나예요")
		}
		rec, err := RecommendEER(goal, Body{Sex: sex, Age: age, Activity: act, HeightCm: cm, WeightKg: kg}, q.Get("mode"))
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, rec)
		return nil
	}))
}
