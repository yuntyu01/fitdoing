// Package admin is the operator page and API: per-user AI model assignment. It is separate from user login: the
// admin logs in with ADMIN_PASSWORD (POST /api/admin/login) and gets a 30-day session cookie. Without
// ADMIN_PASSWORD configured every admin route answers 404.
package admin

import (
	"embed"
	"net/http"
	"strconv"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

func guard(a *auth, h platform.HandlerFunc) http.HandlerFunc {
	return platform.Handle(func(w http.ResponseWriter, r *http.Request) error {
		if !a.enabled() {
			return &platform.Error{Status: http.StatusNotFound, Code: "NOT_FOUND", Message: "없는 주소예요"}
		}
		if !a.valid(r) {
			return &platform.Error{Status: http.StatusUnauthorized, Code: "UNAUTHORIZED", Message: "관리자 로그인이 필요해요"}
		}
		return h(w, r)
	})
}

// UserRow is one user in the admin list.
type UserRow struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	Nickname  string    `json:"nickname"`
	Providers []string  `json:"providers"`
	AIModel   *string   `json:"aiModel"`        // assigned by an admin; null = default
	Effective string    `json:"effectiveModel"` // what the analyze call uses now
}

//go:embed web
var web embed.FS

// page serves one file of the admin page (/admin). The page holds no data or secret: it asks for the password and
// calls the API. Without ADMIN_PASSWORD configured it is 404 like the API.
func page(a *auth, name, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.enabled() {
			http.NotFound(w, r)
			return
		}
		b, err := web.ReadFile("web/" + name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		h := w.Header()
		h.Set("Content-Type", contentType)
		h.Set("Cache-Control", "no-store")
		h.Set("X-Robots-Tag", "noindex, nofollow")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
		_, _ = w.Write(b)
	}
}

// Register adds the admin page and API. password is ADMIN_PASSWORD ("" = everything 404); now is for tests (nil = time.Now).
func Register(mux *http.ServeMux, db *gorm.DB, password string, models *ai.ModelSet, now func() time.Time) {
	a := newAuth(password, now)
	mux.HandleFunc("GET /admin", page(a, "index.html", "text/html; charset=utf-8"))
	mux.HandleFunc("GET /admin/admin.js", page(a, "admin.js", "text/javascript; charset=utf-8"))
	mux.HandleFunc("GET /admin/admin.css", page(a, "admin.css", "text/css; charset=utf-8"))

	// {"password": "..."} -> 204 with the session cookie. Wrong: 401. Too many failures: 429 for 15 minutes.
	mux.HandleFunc("POST /api/admin/login", platform.Handle(func(w http.ResponseWriter, r *http.Request) error {
		if !a.enabled() {
			return &platform.Error{Status: http.StatusNotFound, Code: "NOT_FOUND", Message: "없는 주소예요"}
		}
		c := client(r)
		if a.blocked(c) {
			return &platform.Error{Status: http.StatusTooManyRequests, Code: "TOO_MANY_ATTEMPTS",
				Message: "비밀번호를 여러 번 틀렸어요. 15분 뒤에 다시 해 주세요"}
		}
		var in struct {
			Password string `json:"password"`
		}
		if err := platform.Decode(w, r, &in); err != nil {
			return err
		}
		if !a.passwordOK(in.Password) {
			a.fail(c)
			return &platform.Error{Status: http.StatusUnauthorized, Code: "WRONG_PASSWORD", Message: "비밀번호가 맞지 않아요"}
		}
		a.setCookie(w, r)
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
	mux.HandleFunc("POST /api/admin/logout", platform.Handle(func(w http.ResponseWriter, r *http.Request) error {
		clearCookie(w, r)
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
	// 200 when the session cookie is valid (the page checks it on load), else 401
	mux.HandleFunc("GET /api/admin/session", guard(a, func(w http.ResponseWriter, r *http.Request) error {
		platform.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return nil
	}))

	mux.HandleFunc("GET /api/admin/ai-models", guard(a, func(w http.ResponseWriter, r *http.Request) error {
		platform.JSON(w, http.StatusOK, map[string]any{"default": models.Default(), "allowed": models.Allowed()})
		return nil
	}))

	// Users, newest first. ?limit= (1~200, default 50) &offset=
	mux.HandleFunc("GET /api/admin/users", guard(a, func(w http.ResponseWriter, r *http.Request) error {
		limit, offset := 50, 0
		if v := r.URL.Query().Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > 200 {
				return platform.Invalid("limit", "1~200 사이여야 해요")
			}
			limit = n
		}
		if v := r.URL.Query().Get("offset"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 {
				return platform.Invalid("offset", "0 이상이어야 해요")
			}
			offset = n
		}
		var users []platform.User
		if err := db.Order("created_at DESC").Limit(limit).Offset(offset).Find(&users).Error; err != nil {
			return err
		}
		out := make([]UserRow, 0, len(users))
		for _, u := range users {
			row, err := userRow(db, models, u)
			if err != nil {
				return err
			}
			out = append(out, row)
		}
		platform.JSON(w, http.StatusOK, map[string]any{"users": out})
		return nil
	}))

	// Body {"model": "<allowed model>"} assigns, {"model": null} goes back to the default.
	mux.HandleFunc("PUT /api/admin/users/{id}/ai-model", guard(a, func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Model *string `json:"model"`
		}
		if err := platform.Decode(w, r, &in); err != nil {
			return err
		}
		id := r.PathValue("id")
		if err := models.Assign(id, in.Model); err != nil {
			return err
		}
		var u platform.User
		if err := db.First(&u, "id = ?", id).Error; err != nil {
			return err
		}
		row, err := userRow(db, models, u)
		if err != nil {
			return err
		}
		platform.JSON(w, http.StatusOK, row)
		return nil
	}))
}

func userRow(db *gorm.DB, models *ai.ModelSet, u platform.User) (UserRow, error) {
	row := UserRow{ID: u.ID, CreatedAt: u.CreatedAt, Providers: []string{}}
	var nick []string
	if err := db.Table("user_settings").Where("user_id = ?", u.ID).Pluck("nickname", &nick).Error; err != nil {
		return row, err
	}
	if len(nick) > 0 {
		row.Nickname = nick[0]
	}
	if err := db.Table("identities").Where("user_id = ?", u.ID).Order("provider").Pluck("provider", &row.Providers).Error; err != nil {
		return row, err
	}
	assigned, err := models.Assigned(u.ID)
	if err != nil {
		return row, err
	}
	if assigned != "" {
		row.AIModel = &assigned
	}
	_, row.Effective, err = models.For(u.ID)
	return row, err
}
