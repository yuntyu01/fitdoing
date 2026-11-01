package auth

import (
	"net/http"
	"strings"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func Register(mux *http.ServeMux, svc *Service, allowDeviceUpgrade ...bool) {
	registerKakaoEvents(mux, svc)
	mux.HandleFunc("GET /api/auth/providers", func(w http.ResponseWriter, r *http.Request) {
		platform.JSON(w, http.StatusOK, svc.Providers())
	})
	mux.HandleFunc("POST /api/auth/login", platform.Handle(func(w http.ResponseWriter, r *http.Request) error {
		var b struct {
			Provider          Provider `json:"provider"`
			Token             string   `json:"token"`
			LegacyDeviceToken string   `json:"legacyDeviceToken"`
		}
		if err := platform.Decode(w, r, &b); err != nil {
			return err
		}
		if len(allowDeviceUpgrade) == 0 || !allowDeviceUpgrade[0] {
			b.LegacyDeviceToken = ""
		}
		res, err := svc.LoginWithDevice(r.Context(), b.Provider, b.Token, b.LegacyDeviceToken)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, res)
		return nil
	}))
	mux.HandleFunc("DELETE /api/account", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		if len(allowDeviceUpgrade) > 0 && allowDeviceUpgrade[0] {
			if err := svc.retireDeletedDevice(uid, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")); err != nil {
				return err
			}
		}
		if err := svc.DeleteAccount(uid); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
}
