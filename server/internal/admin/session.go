package admin

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Login with ADMIN_PASSWORD gives a signed session cookie, so the admin types the password once per 30 days
// (and the browser can remember it). The signing key comes from the password: changing ADMIN_PASSWORD logs
// every admin session out, and nobody without the password can forge a cookie.

const (
	cookieName = "fd_admin"
	sessionTTL = 30 * 24 * time.Hour
	// failed logins: per client 5 per 15 minutes, all clients together 50 per 15 minutes
	failWindow    = 15 * time.Minute
	failPerClient = 5
	failTotal     = 50
)

type auth struct {
	password []byte
	key      []byte
	now      func() time.Time

	mu    sync.Mutex
	fails map[string][]time.Time // client -> failure times in the window
	total []time.Time
}

func newAuth(password string, now func() time.Time) *auth {
	if now == nil {
		now = time.Now
	}
	sum := sha256.Sum256([]byte("fitdoing-admin-session\x00" + password))
	return &auth{password: []byte(password), key: sum[:], now: now, fails: map[string][]time.Time{}}
}

func (a *auth) enabled() bool { return len(a.password) > 0 }

func (a *auth) sign(exp int64) string {
	m := hmac.New(sha256.New, a.key)
	m.Write([]byte(strconv.FormatInt(exp, 10)))
	return hex.EncodeToString(m.Sum(nil))
}

func (a *auth) cookieValue() (string, time.Time) {
	exp := a.now().Add(sessionTTL)
	v := strconv.FormatInt(exp.Unix(), 10) + "." + a.sign(exp.Unix())
	return base64.RawURLEncoding.EncodeToString([]byte(v)), exp
}

// valid reports whether the request carries an unexpired session cookie signed with the current password.
func (a *auth) valid(r *http.Request) bool {
	if !a.enabled() {
		return false
	}
	c, err := r.Cookie(cookieName)
	if err != nil {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil {
		return false
	}
	expStr, sig, ok := strings.Cut(string(raw), ".")
	if !ok {
		return false
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || a.now().Unix() > exp {
		return false
	}
	return hmac.Equal([]byte(sig), []byte(a.sign(exp)))
}

func (a *auth) passwordOK(p string) bool {
	x := sha256.Sum256([]byte(p))
	y := sha256.Sum256(a.password)
	return subtle.ConstantTimeCompare(x[:], y[:]) == 1
}

// client is the caller's address: the first X-Forwarded-For hop (the host's proxy sets it), else the peer.
func client(r *http.Request) string {
	if f := r.Header.Get("X-Forwarded-For"); f != "" {
		first, _, _ := strings.Cut(f, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func recent(ts []time.Time, since time.Time) []time.Time {
	out := ts[:0]
	for _, t := range ts {
		if t.After(since) {
			out = append(out, t)
		}
	}
	return out
}

// blocked: too many recent failures from this client or overall.
func (a *auth) blocked(c string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	since := a.now().Add(-failWindow)
	a.fails[c] = recent(a.fails[c], since)
	a.total = recent(a.total, since)
	return len(a.fails[c]) >= failPerClient || len(a.total) >= failTotal
}

func (a *auth) fail(c string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	t := a.now()
	a.fails[c] = append(a.fails[c], t)
	a.total = append(a.total, t)
}

func secure(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func (a *auth) setCookie(w http.ResponseWriter, r *http.Request) {
	v, exp := a.cookieValue()
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: v, Path: "/", Expires: exp, MaxAge: int(sessionTTL.Seconds()),
		HttpOnly: true, Secure: secure(r), SameSite: http.SameSiteStrictMode})
}

func clearCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: secure(r), SameSite: http.SameSiteStrictMode})
}
