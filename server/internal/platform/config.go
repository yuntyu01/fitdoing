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
}

const defaultPostgresDSN = "host=localhost user=fitdoing password=fitdoing dbname=fitdoing port=5432 sslmode=disable"

// LoadConfig builds a Config from getenv (os.Getenv in production).
//
//	DB_URL     Postgres DSN (default: local fitdoing DB). "sqlite::memory:" or "sqlite:./dev.db" selects SQLite.
//	DB_DRIVER  postgres | sqlite (optional; inferred from DB_URL)
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
		GeminiModel: env("GEMINI_MODEL", "gemini-2.5-flash"),
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
	return c, nil
}
