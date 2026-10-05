package platform

import (
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"
)

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(c int) {
	s.status = c
	s.ResponseWriter.WriteHeader(c)
}

// Logging logs one line per request and turns panics into a 500.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic", "path", r.URL.Path, "panic", rec)
				JSON(sw, http.StatusInternalServerError, map[string]string{"code": "INTERNAL", "message": "서버 오류가 났어요"})
			}
			slog.Info("request", "method", r.Method, "path", r.URL.Path, "status", sw.status,
				"ms", time.Since(start).Milliseconds())
		}()
		next.ServeHTTP(sw, r)
	})
}

// CORS allows the given origins ("*" for any) and answers preflight requests.
func CORS(origins []string) func(http.Handler) http.Handler {
	any := slices.Contains(origins, "*")
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				switch {
				case any:
					w.Header().Set("Access-Control-Allow-Origin", "*")
				case slices.Contains(origins, origin):
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Add("Vary", "Origin")
				}
			}
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				w.Header().Set("Access-Control-Allow-Methods", strings.Join([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}, ", "))
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Device-Id")
				w.Header().Set("Access-Control-Max-Age", "3600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
