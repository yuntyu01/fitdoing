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
