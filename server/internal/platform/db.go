package platform

import (
	"fmt"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// User is the owner of all data; every other table references it with ON DELETE CASCADE.
// A user is created by the first login with a provider account (see package auth).
type User struct {
	ID          string    `gorm:"column:id;primaryKey;size:36"`
	CreatedAt   time.Time `gorm:"column:created_at;not null"`
	AuthVersion uint64    `gorm:"not null;default:0"`
	AuthBlocked bool      `gorm:"not null;default:false"`
}

func (User) TableName() string { return "users" }

// OpenDB connects to Postgres (production) or SQLite (dev and tests).
func OpenDB(driver, dsn string) (*gorm.DB, error) {
	cfg := &gorm.Config{Logger: logger.Default.LogMode(logger.Warn)}
	switch driver {
	case "sqlite":
		// SQLite enforces foreign keys only when asked, per connection.
		sep := "?"
		if strings.Contains(dsn, "?") {
			sep = "&"
		}
		db, err := gorm.Open(sqlite.Open(dsn+sep+"_pragma=foreign_keys(1)"), cfg)
		if err != nil {
			return nil, err
		}
		sqlDB, err := db.DB()
		if err != nil {
			return nil, err
		}
		sqlDB.SetMaxOpenConns(1) // an in-memory SQLite DB is per connection
		return db, nil
	case "postgres":
		return gorm.Open(postgres.Open(dsn), cfg)
	}
	return nil, fmt.Errorf("unknown DB driver %q", driver)
}
