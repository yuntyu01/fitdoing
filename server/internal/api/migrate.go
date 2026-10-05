package api

import (
	"encoding/json"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/coupon"
	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/lock"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"gorm.io/gorm"
)

// Migrate creates or updates the tables. A database from before the normalization (settings as one
// JSON column, meal items as items_json) is converted in place.
func Migrate(db *gorm.DB) error {
	m := db.Migrator()
	type legacySettings struct {
		DeviceID    string  `gorm:"column:device_id"`
		JSON        string  `gorm:"column:json"`
		PendingMode *string `gorm:"column:pending_mode"`
		PendingFrom *string `gorm:"column:pending_from"`
	}
	var oldSettings []legacySettings
	if m.HasTable("user_settings") && m.HasColumn("user_settings", "json") {
		if err := db.Table("user_settings").Find(&oldSettings).Error; err != nil {
			return err
		}
		if err := m.DropTable("user_settings"); err != nil {
			return err
		}
	}
	type legacyItems struct {
		ID        string `gorm:"column:id"`
		ItemsJSON string `gorm:"column:items_json"`
	}
	var oldItems []legacyItems
	if m.HasTable("meal_logs") && m.HasColumn("meal_logs", "items_json") {
		if err := db.Table("meal_logs").Select("id, items_json").Find(&oldItems).Error; err != nil {
			return err
		}
	}
	// devices first; rows of an older database get their device row before the foreign keys exist
	hadTables := map[string]bool{}
	for _, t := range []string{"meal_logs", "lock_events", "coupon_uses", "gym_logs", "sleep_logs"} {
		hadTables[t] = m.HasTable(t)
	}
	if err := db.AutoMigrate(&platform.Device{}); err != nil {
		return err
	}
	for _, o := range oldSettings {
		if err := platform.EnsureDevice(db, o.DeviceID); err != nil {
			return err
		}
	}
	for t, had := range hadTables {
		if !had {
			continue
		}
		var ids []string
		if err := db.Table(t).Distinct().Pluck("device_id", &ids).Error; err != nil {
			return err
		}
		for _, id := range ids {
			if err := platform.EnsureDevice(db, id); err != nil {
				return err
			}
		}
	}
	models := append(settings.Models(), meal.Models()...)
	models = append(models, &lock.Event{}, &coupon.Use{}, &gym.Log{}, &gym.SleepLog{})
	if err := db.AutoMigrate(models...); err != nil {
		return err
	}
	st := settings.NewService(db, platform.Clock{Loc: time.UTC})
	for _, o := range oldSettings {
		var s settings.Settings
		if err := json.Unmarshal([]byte(o.JSON), &s); err != nil {
			return err
		}
		var pm *settings.Mode
		var pf *platform.Date
		if o.PendingMode != nil && o.PendingFrom != nil {
			v, d := settings.Mode(*o.PendingMode), platform.Date(*o.PendingFrom)
			pm, pf = &v, &d
		}
		if err := st.Restore(o.DeviceID, s, pm, pf); err != nil {
			return err
		}
	}
	if len(oldItems) > 0 || m.HasColumn("meal_logs", "items_json") {
		for _, o := range oldItems {
			var items []ai.Item
			if o.ItemsJSON == "" || json.Unmarshal([]byte(o.ItemsJSON), &items) != nil {
				continue
			}
			for i, it := range items {
				row := meal.ItemRow{MealLogID: o.ID, Position: i, Name: it.Name, Amount: it.Amount}
				if err := db.Omit("MealLog").Create(&row).Error; err != nil {
					return err
				}
			}
		}
		if err := db.Exec("ALTER TABLE meal_logs DROP COLUMN items_json").Error; err != nil {
			return err
		}
	}
	return nil
}
