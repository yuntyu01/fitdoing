package platform

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
)

// HandlerFunc is a handler that may fail with an error; Handle renders it.
type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

// UserFunc is a handler that needs the logged-in user.
type UserFunc func(w http.ResponseWriter, r *http.Request, userID string) error

func Handle(h HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := h(w, r); err != nil {
			e := AsError(err)
			if e.Status >= 500 {
				slog.Error("request failed", "path", r.URL.Path, "err", err)
			}
			JSON(w, e.Status, map[string]string{"code": e.Code, "message": e.Message})
		}
	}
}

type userKey struct{}

// ContextWithUser returns ctx carrying the authenticated user id (set by Authenticate).
func ContextWithUser(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userKey{}, userID)
}

// WithUser runs h for the user that Authenticate found; without a valid login it answers 401.
func WithUser(h UserFunc) http.HandlerFunc {
	return Handle(func(w http.ResponseWriter, r *http.Request) error {
		id, _ := r.Context().Value(userKey{}).(string)
		if id == "" {
			return Unauthorized("로그인이 필요해요")
		}
		return h(w, r, id)
	})
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Decode reads a JSON body (max 1MB). Unknown fields are ignored.
func Decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return BadRequest("INVALID", "요청 형식이 잘못됐어요")
	}
	return nil
}

// QueryDate reads a required YYYY-MM-DD query parameter.
func QueryDate(r *http.Request, name string) (Date, error) {
	s := r.URL.Query().Get(name)
	if s == "" {
		return "", Invalid(name, "필수예요")
	}
	d, err := ParseDate(s)
	if err != nil {
		return "", Invalid(name, "YYYY-MM-DD 형식이어야 해요")
	}
	return d, nil
}
