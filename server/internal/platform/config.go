package platform

import (
	"fmt"
	"net"
	neturl "net/url"
	"slices"
	"strings"
	"time"
)

// Config is read from environment variables.
type Config struct {
	Port          string
	DBDriver      string // postgres | sqlite
	DBDSN         string
	AIProvider    string // mock | gemini
	GeminiKey     string
	GeminiModel   string   // default model for every user
	GeminiExtra   []string // models an admin may assign per user besides the default: BuiltinGeminiModels + GEMINI_MODELS
	AdminPassword string   // ADMIN_PASSWORD: admin page login (10+ chars); "" = admin page and API off
	Zone          *time.Location
	CORSOrigins   []string

	AuthSecret      string   // signs login tokens (HS256); required with Postgres
	GoogleClientIDs []string // accepted audiences of Google ID tokens (the web client id the app signs in with)
	AppleClientID   string   // audience of Apple identity tokens (the app's bundle id)
	KakaoAppID      string   // Kakao app id (numeric); access tokens of other apps are refused
	KakaoRESTKey    string   // KAKAO_REST_API_KEY: Kakao Local place search for the gym ("" = search off)
	KakaoLocalURL   string   // KAKAO_LOCAL_URL: (tests) replaces https://dapi.kakao.com
	FoodSafetyKey   string   // FOODSAFETY_API_KEY: 식품안전나라 open API key (barcode -> product)
	DataGoKrKey     string   // DATA_GO_KR_API_KEY: 공공데이터포털 key (식품영양성분DB). Both needed for barcode lookup
	FoodSafetyURL   string   // (tests) replaces http://openapi.foodsafetykorea.go.kr
	DataGoKrURL     string   // (tests) replaces https://apis.data.go.kr
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

// BuiltinGeminiModels are the models an admin can assign per user without any configuration (besides
// GEMINI_MODEL, the default). IDs from ai.google.dev/gemini-api/docs/models.
var BuiltinGeminiModels = []string{"gemini-3.5-flash-lite", "gemini-3.8-flash"}

const defaultPostgresDSN = "host=localhost user=fitdoing password=fitdoing dbname=fitdoing port=5432 sslmode=disable"

// LoadConfig builds a Config from getenv (os.Getenv in production).
//
//	DB_URL     Postgres DSN (default: local fitdoing DB). "sqlite::memory:" or "sqlite:./dev.db" selects SQLite.
//	           Without it: DATABASE_URL, then DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD (DB_SSLMODE, default disable).
//	DB_DRIVER  postgres | sqlite (optional; inferred from DB_URL)
//	AUTH_SECRET        login token signing key, 32+ chars (SQLite dev has a built-in default)
//	GOOGLE_CLIENT_IDS  comma separated web client ids of the Google sign-in
//	APPLE_CLIENT_ID    Apple audience (default com.fitdoing.app)
//	KAKAO_APP_ID       numeric Kakao app id
//	KAKAO_REST_API_KEY (optional) REST API key of the same Kakao app: gym place search (/api/places/search)
//	FOODSAFETY_API_KEY, DATA_GO_KR_API_KEY (optional, both) barcode -> product nutrition (/api/foods/barcode/{code})
//	KAKAO_TOKEN_INFO_URL  (optional) replaces Kakao's token-info URL, for end-to-end tests with a fake Kakao
//	GEMINI_MODELS      (optional) comma separated models to add to BuiltinGeminiModels; GEMINI_MODEL stays the default
//	ADMIN_PASSWORD     (optional, 10+ chars) enables the admin page /admin and its API
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
	for _, m := range append(BuiltinGeminiModels, strings.Split(getenv("GEMINI_MODELS"), ",")...) {
		if m = strings.TrimSpace(m); m != "" && m != c.GeminiModel && !slices.Contains(c.GeminiExtra, m) {
			c.GeminiExtra = append(c.GeminiExtra, m)
		}
	}
	c.AdminPassword = getenv("ADMIN_PASSWORD")
	if strings.TrimSpace(c.AdminPassword) == "" {
		c.AdminPassword = ""
	} else if len([]rune(c.AdminPassword)) < 10 {
		return c, fmt.Errorf("ADMIN_PASSWORD는 10자 이상이어야 해요")
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
	c.KakaoRESTKey = strings.TrimSpace(getenv("KAKAO_REST_API_KEY"))
	c.KakaoLocalURL = strings.TrimSpace(getenv("KAKAO_LOCAL_URL"))
	c.FoodSafetyKey = strings.TrimSpace(getenv("FOODSAFETY_API_KEY"))
	c.DataGoKrKey = strings.TrimSpace(getenv("DATA_GO_KR_API_KEY"))
	c.FoodSafetyURL = strings.TrimSpace(getenv("FOODSAFETY_URL"))
	c.DataGoKrURL = strings.TrimSpace(getenv("DATA_GO_KR_URL"))
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

	url := goPostgresURL(firstNonEmpty(getenv("DB_URL"), getenv("DATABASE_URL"), hostDSN(getenv)))
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

// goPostgresURL turns a SQLAlchemy-style URL ("postgresql+psycopg2://...", "postgres+asyncpg://...") that some
// hosts inject into DATABASE_URL into the plain "postgres://..." form the Go driver (pgx) parses. The driver
// part names a Python library and means nothing to Go; everything after "://" is kept as is.
func goPostgresURL(u string) string {
	scheme, rest, ok := strings.Cut(u, "://")
	if !ok {
		return u
	}
	base, _, hasDriver := strings.Cut(strings.ToLower(scheme), "+")
	if hasDriver && (base == "postgresql" || base == "postgres") {
		return "postgres://" + rest
	}
	return u
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return ""
}

// hostDSN builds a Postgres URL from DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD (what hosts such as KoDeploy
// inject for an attached database). "" when DB_HOST is unset. DB_SSLMODE defaults to disable.
func hostDSN(getenv func(string) string) string {
	host := strings.TrimSpace(getenv("DB_HOST"))
	if host == "" {
		return ""
	}
	port := firstNonEmpty(getenv("DB_PORT"), "5432")
	u := neturl.URL{
		Scheme:   "postgres",
		User:     neturl.UserPassword(strings.TrimSpace(getenv("DB_USER")), getenv("DB_PASSWORD")),
		Host:     net.JoinHostPort(host, port),
		Path:     "/" + strings.TrimSpace(getenv("DB_NAME")),
		RawQuery: "sslmode=" + neturl.QueryEscape(firstNonEmpty(getenv("DB_SSLMODE"), "disable")),
	}
	return u.String()
}
