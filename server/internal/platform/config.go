package platform

import (
	"fmt"
	"strings"
	"time"
)

// Config is read from environment variables.
type Config struct {
	Port        string
	DBDriver    string // postgres | sqlite
	DBDSN       string
	AIProvider  string // mock | gemini
	GeminiKey   string
	GeminiModel string
	Zone        *time.Location
	CORSOrigins []string

	AuthSecret      string   // signs login tokens (HS256); required with Postgres
	GoogleClientIDs []string // accepted audiences of Google ID tokens (the web client id the app signs in with)
	AppleClientID   string   // audience of Apple identity tokens (the app's bundle id)
	KakaoAppID      string   // Kakao app id (numeric); access tokens of other apps are refused
	KakaoInfoURL    string   // token-info endpoint of Kakao; only a test double differs from the default
	AuthDisabled    bool     // AUTH_DISABLED=1: every Bearer token is accepted as one fixed dev user (development only)

	PublicURL   string // PUBLIC_BASE_URL, e.g. https://fitdoing.app (share page links); "" = from the request
	PhotoStore  string // "" (photo backup off) | file | r2
	PhotoDir    string // file: directory for photos
	R2Endpoint  string // r2: https://<account id>.r2.cloudflarestorage.com
	R2Bucket    string
	R2AccessKey string
	R2SecretKey string
}

const defaultPostgresDSN = "host=localhost user=fitdoing password=fitdoing dbname=fitdoing port=5432 sslmode=disable"

// LoadConfig builds a Config from getenv (os.Getenv in production).
//
//	DB_URL     Postgres DSN (default: local fitdoing DB). "sqlite::memory:" or "sqlite:./dev.db" selects SQLite.
//	DB_DRIVER  postgres | sqlite (optional; inferred from DB_URL)
//	AUTH_SECRET        login token signing key, 32+ chars (SQLite dev has a built-in default)
//	GOOGLE_CLIENT_IDS  comma separated web client ids of the Google sign-in
//	APPLE_CLIENT_ID    Apple audience (default com.fitdoing.app)
//	KAKAO_APP_ID       numeric Kakao app id
//	KAKAO_TOKEN_INFO_URL  (optional) replaces Kakao's token-info URL, for end-to-end tests with a fake Kakao
func LoadConfig(getenv func(string) string) (Config, error) {
	env := func(k, def string) string {
		if v := strings.TrimSpace(getenv(k)); v != "" {
			return v
		}
		return def
	}
	c := Config{
		Port:        env("PORT", "8080"),
		AIProvider:  env("AI_PROVIDER", "mock"),
		GeminiKey:   getenv("GEMINI_API_KEY"),
		GeminiModel: env("GEMINI_MODEL", "gemini-3.5-flash-lite"),
	}
	c.AuthSecret = strings.TrimSpace(getenv("AUTH_SECRET"))
	c.AuthDisabled = strings.TrimSpace(getenv("AUTH_DISABLED")) == "1"
	c.PublicURL = strings.TrimRight(strings.TrimSpace(getenv("PUBLIC_BASE_URL")), "/")
	c.PhotoStore = strings.ToLower(strings.TrimSpace(getenv("PHOTO_STORE")))
	c.PhotoDir = env("PHOTO_DIR", "./photos")
	c.R2Endpoint = strings.TrimSpace(getenv("R2_ENDPOINT"))
	c.R2Bucket = strings.TrimSpace(getenv("R2_BUCKET"))
	c.R2AccessKey = strings.TrimSpace(getenv("R2_ACCESS_KEY_ID"))
	c.R2SecretKey = strings.TrimSpace(getenv("R2_SECRET_ACCESS_KEY"))
	switch c.PhotoStore {
	case "", "file":
	case "r2":
		if c.R2Endpoint == "" || c.R2Bucket == "" || c.R2AccessKey == "" || c.R2SecretKey == "" {
			return c, fmt.Errorf("PHOTO_STORE=r2 에는 R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY 가 모두 필요해요")
		}
	default:
		return c, fmt.Errorf("PHOTO_STORE는 비우거나 file 또는 r2 여야 해요: %q", c.PhotoStore)
	}
	c.AppleClientID = env("APPLE_CLIENT_ID", "com.fitdoing.app")
	c.KakaoAppID = strings.TrimSpace(getenv("KAKAO_APP_ID"))
	c.KakaoInfoURL = strings.TrimSpace(getenv("KAKAO_TOKEN_INFO_URL"))
	for _, id := range strings.Split(getenv("GOOGLE_CLIENT_IDS"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			c.GoogleClientIDs = append(c.GoogleClientIDs, id)
		}
	}
	zone, err := time.LoadLocation(env("ZONE", "Asia/Seoul"))
	if err != nil {
		return c, fmt.Errorf("ZONE: %w", err)
	}
	c.Zone = zone
	for _, o := range strings.Split(env("CORS_ORIGINS", "*"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.CORSOrigins = append(c.CORSOrigins, o)
		}
	}

	url := strings.TrimSpace(getenv("DB_URL"))
	c.DBDriver = strings.ToLower(strings.TrimSpace(getenv("DB_DRIVER")))
	if strings.HasPrefix(url, "sqlite:") {
		c.DBDriver = "sqlite"
		url = strings.TrimPrefix(url, "sqlite:")
	}
	if c.DBDriver == "" {
		c.DBDriver = "postgres"
	}
	switch c.DBDriver {
	case "sqlite":
		if url == "" {
			url = ":memory:"
		}
	case "postgres":
		if url == "" {
			url = defaultPostgresDSN
		}
	default:
		return c, fmt.Errorf("DB_DRIVER는 postgres 또는 sqlite 여야 해요: %q", c.DBDriver)
	}
	c.DBDSN = url
	switch {
	case c.AuthDisabled && c.AuthSecret == "":
		c.AuthSecret = "auth-disabled-secret-not-used-0123456789"
	case c.AuthSecret == "" && c.DBDriver == "sqlite":
		c.AuthSecret = "dev-only-secret-change-me-0123456789abcdef" // local development only
	case len(c.AuthSecret) < 32:
		return c, fmt.Errorf("AUTH_SECRET은 32자 이상이어야 해요 (예: openssl rand -hex 32)")
	}
	return c, nil
}
