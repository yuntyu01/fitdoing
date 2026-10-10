package platform

import "testing"

func envOf(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDatabaseFromHostInjectedVariables(t *testing.T) {
	secret := "0123456789abcdef0123456789abcdef"
	cases := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"DB_URL wins", map[string]string{"DB_URL": "postgres://a@x/db", "DATABASE_URL": "postgres://b@y/db", "DB_HOST": "z"},
			"postgres://a@x/db"},
		{"DATABASE_URL", map[string]string{"DATABASE_URL": "postgres://b@y/db", "DB_HOST": "z"}, "postgres://b@y/db"},
		{"DB_HOST parts", map[string]string{"DB_HOST": "postgres", "DB_PORT": "6543", "DB_NAME": "fit", "DB_USER": "app",
			"DB_PASSWORD": "p@ss w/rd"}, "postgres://app:p%40ss%20w%2Frd@postgres:6543/fit?sslmode=disable"},
		{"DB_HOST default port, sslmode", map[string]string{"DB_HOST": "db", "DB_NAME": "fit", "DB_USER": "app",
			"DB_PASSWORD": "pw", "DB_SSLMODE": "require"}, "postgres://app:pw@db:5432/fit?sslmode=require"},
		{"nothing set", map[string]string{}, defaultPostgresDSN},
		// some hosts inject a SQLAlchemy URL; the Go driver can't parse "postgresql+psycopg2://" (deploy of 2026-10-09)
		{"SQLAlchemy psycopg2 URL", map[string]string{"DATABASE_URL": "postgresql+psycopg2://app:s3cr%40t@postgres:5432/app"},
			"postgres://app:s3cr%40t@postgres:5432/app"},
		{"SQLAlchemy asyncpg URL", map[string]string{"DATABASE_URL": "postgres+asyncpg://app:pw@db/app?sslmode=require"},
			"postgres://app:pw@db/app?sslmode=require"},
		{"postgresql:// kept", map[string]string{"DATABASE_URL": "postgresql://app:pw@db/app"}, "postgresql://app:pw@db/app"},
	}
	for _, c := range cases {
		c.env["AUTH_SECRET"] = secret
		cfg, err := LoadConfig(envOf(c.env))
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if cfg.DBDriver != "postgres" || cfg.DBDSN != c.want {
			t.Errorf("%s: got %s %q, want postgres %q", c.name, cfg.DBDriver, cfg.DBDSN, c.want)
		}
	}
}

func TestAIModelsAndAdminToken(t *testing.T) {
	base := map[string]string{"AUTH_SECRET": "0123456789abcdef0123456789abcdef", "DB_URL": "sqlite::memory:"}
	with := func(kv ...string) map[string]string {
		m := map[string]string{}
		for k, v := range base {
			m[k] = v
		}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i]] = kv[i+1]
		}
		return m
	}
	cfg, err := LoadConfig(envOf(with("GEMINI_MODELS", " gemini-3.8-flash, gemini-3.5-flash-lite ,gemini-3.8-flash,")))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.GeminiModel != "gemini-3.5-flash-lite" || len(cfg.GeminiExtra) != 1 || cfg.GeminiExtra[0] != "gemini-3.8-flash" {
		t.Fatalf("models: %q + %q", cfg.GeminiModel, cfg.GeminiExtra)
	}
	if cfg.AdminToken != "" {
		t.Fatal("admin API must be off by default")
	}
	if _, err := LoadConfig(envOf(with("ADMIN_TOKEN", "short"))); err == nil {
		t.Fatal("short ADMIN_TOKEN accepted")
	}
	cfg, err = LoadConfig(envOf(with("ADMIN_TOKEN", "0123456789abcdef0123456789abcdef")))
	if err != nil || cfg.AdminToken == "" {
		t.Fatalf("admin token: %v", err)
	}
}
