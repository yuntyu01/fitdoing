package platform

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
)

var deviceIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

// HandlerFunc is a handler that may fail with an error; Handle renders it.
type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

// DeviceFunc is a handler that needs the validated X-Device-Id.
type DeviceFunc func(w http.ResponseWriter, r *http.Request, deviceID string) error

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

// WithDevice validates X-Device-Id (8~64 chars of [A-Za-z0-9_-]) before running h.
func WithDevice(h DeviceFunc) http.HandlerFunc {
	return Handle(func(w http.ResponseWriter, r *http.Request) error {
		id := r.Header.Get("X-Device-Id")
		if !deviceIDPattern.MatchString(id) {
			return BadRequest("DEVICE_ID", "X-Device-Id 헤더가 필요해요 (8~64자 영문·숫자·-_)")
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
