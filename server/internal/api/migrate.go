package api

import (
	"errors"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
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

// isLegacy reports whether the database still has the device-keyed schema (owner column device_id, table devices).
func isLegacy(m gorm.Migrator) bool {
	return m.HasTable("devices") ||
		(m.HasTable("meal_logs") && !m.HasColumn("meal_logs", "user_id")) ||
		(m.HasTable("user_settings") && !m.HasColumn("user_settings", "user_id"))
}

// Migrate creates or updates the tables. Legacy data requires a reviewed migration; never discard it on startup.
func Migrate(db *gorm.DB) error {
	m := db.Migrator()
	if isLegacy(m) {
		return errors.New("legacy device-keyed database found: preserve data and run a reviewed migration before starting this version")
	}
	// users first, every other table references it
	models := append(auth.Models(), settings.Models()...)
	models = append(models, meal.Models()...)
	models = append(models, &lock.Event{}, &coupon.Use{}, &gym.Log{}, &gym.SleepLog{})
	models = append(models, photo.Models()...)
	models = append(models, friends.Models()...)
	models = append(models, share.Models()...)
	models = append(models, ai.Models()...)
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
	// Same for the goal check, which gained 'bulk' under a new name (ck_user_settings_goal_v2).
	if m.HasConstraint(&settings.Row{}, "ck_user_settings_goal") {
		if err := m.DropConstraint(&settings.Row{}, "ck_user_settings_goal"); err != nil {
			return err
		}
	}
	return nil
}
