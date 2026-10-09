package auth

import (
	"net/http"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("POST /api/auth/login", platform.Handle(func(w http.ResponseWriter, r *http.Request) error {
		var b struct {
			Provider Provider `json:"provider"`
			Token    string   `json:"token"`
		}
		if err := platform.Decode(w, r, &b); err != nil {
			return err
		}
		res, err := svc.Login(r.Context(), b.Provider, b.Token)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, res)
		return nil
	}))
	mux.HandleFunc("DELETE /api/account", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		if err := svc.DeleteAccount(uid); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
}
