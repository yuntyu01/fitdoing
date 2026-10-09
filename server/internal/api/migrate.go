package api

import (
	"log/slog"

	"github.com/yuntyu01/fitdoing/server/internal/auth"
	"github.com/yuntyu01/fitdoing/server/internal/coupon"
	"github.com/yuntyu01/fitdoing/server/internal/friends"
	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/photo"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"github.com/yuntyu01/fitdoing/server/internal/share"
	"gorm.io/gorm"
)

// legacyTables are the tables of the device-keyed schema (before login), children first.
var legacyTables = []string{
	"meal_items", "meal_logs", "lock_events", "coupon_uses", "gym_logs", "sleep_logs",
	"allowed_apps", "gym_days", "meal_slots", "user_settings", "devices",
}

// isLegacy reports whether the database still has the device-keyed schema (owner column device_id, table devices).
func isLegacy(m gorm.Migrator) bool {
	return m.HasTable("devices") ||
		(m.HasTable("meal_logs") && !m.HasColumn("meal_logs", "user_id")) ||
		(m.HasTable("user_settings") && !m.HasColumn("user_settings", "user_id"))
}

// Migrate creates or updates the tables. A database from before the login (data keyed by a per-phone device id,
// which cannot be tied to an account) is emptied: its tables are dropped and created again.
func Migrate(db *gorm.DB) error {
	m := db.Migrator()
	if isLegacy(m) {
		slog.Warn("device-keyed tables found, dropping them (data of the pre-login schema is discarded)")
		for _, t := range legacyTables {
			if m.HasTable(t) {
				if err := m.DropTable(t); err != nil {
					return err
				}
			}
		}
	}
	// users first, every other table references it
	models := append(auth.Models(), settings.Models()...)
	models = append(models, meal.Models()...)
	models = append(models, &lock.Event{}, &coupon.Use{}, &gym.Log{}, &gym.SleepLog{})
	models = append(models, photo.Models()...)
	models = append(models, friends.Models()...)
	models = append(models, share.Models()...)
	if err := db.AutoMigrate(models...); err != nil {
		return err
	}
	// AutoMigrate adds a missing CHECK by name but never changes an existing one: the portion check was
	// widened to 1.5 and 2 under a new name, so the old, narrower one has to go.
	if m.HasConstraint(&meal.Log{}, "ck_meal_logs_portion") {
		if err := m.DropConstraint(&meal.Log{}, "ck_meal_logs_portion"); err != nil {
			return err
		}
	}
	return nil
}
