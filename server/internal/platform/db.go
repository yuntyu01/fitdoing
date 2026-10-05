package platform

import (
	"fmt"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

// Device is the owner of all data; every other table references it with ON DELETE CASCADE.
type Device struct {
	DeviceKey string    `gorm:"column:device_id;primaryKey;size:64"`
	CreatedAt time.Time `gorm:"column:created_at;not null"`
}

func (Device) TableName() string { return "devices" }

// EnsureDevice inserts the device row if it is missing (portable INSERT ... ON CONFLICT DO NOTHING).
func EnsureDevice(db *gorm.DB, deviceID string) error {
	d := Device{DeviceKey: deviceID, CreatedAt: time.Now().UTC()}
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&d).Error
}

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
