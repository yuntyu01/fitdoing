package ai

import (
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

// UserModel is the model an admin chose for one user (table user_ai_models). No row = the default model.
type UserModel struct {
	UserID    string    `gorm:"column:user_id;primaryKey;size:64"`
	Model     string    `gorm:"column:model;size:64;not null"`
	UpdatedAt time.Time `gorm:"column:updated_at;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (UserModel) TableName() string { return "user_ai_models" }

// Models lists the tables of this package for AutoMigrate.
func Models() []any { return []any{&UserModel{}} }

// ModelSet holds one analyzer per allowed model and picks the one for a user. The allowed models come from the
// server config (GEMINI_MODEL is the default, GEMINI_MODELS adds more); an admin assigns them per user.
type ModelSet struct {
	db        *gorm.DB
	def       string
	order     []string
	analyzers map[string]FoodAnalyzer
}

// NewModelSet: analyzers must contain the default model.
func NewModelSet(db *gorm.DB, defaultModel string, order []string, analyzers map[string]FoodAnalyzer) (*ModelSet, error) {
	if analyzers[defaultModel] == nil {
		return nil, fmt.Errorf("기본 모델 %q 의 분석기가 없어요", defaultModel)
	}
	return &ModelSet{db: db, def: defaultModel, order: order, analyzers: analyzers}, nil
}

// SingleModel wraps one analyzer as the only (default) model, as before per-user models.
func SingleModel(db *gorm.DB, name string, a FoodAnalyzer) *ModelSet {
	m, _ := NewModelSet(db, name, []string{name}, map[string]FoodAnalyzer{name: a})
	return m
}

func (m *ModelSet) Default() string   { return m.def }
func (m *ModelSet) Allowed() []string { return append([]string(nil), m.order...) }

func (m *ModelSet) allowed(model string) bool { return m.analyzers[model] != nil }

// Assigned is the model an admin set for the user, "" when none.
func (m *ModelSet) Assigned(userID string) (string, error) {
	var row UserModel
	err := m.db.First(&row, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	return row.Model, err
}

// For returns the analyzer and model name to use for the user. A stored model that is no longer allowed
// (removed from GEMINI_MODELS) falls back to the default.
func (m *ModelSet) For(userID string) (FoodAnalyzer, string, error) {
	model, err := m.Assigned(userID)
	if err != nil {
		return nil, "", err
	}
	if model == "" {
		return m.analyzers[m.def], m.def, nil
	}
	if !m.allowed(model) {
		slog.Warn("assigned AI model is not allowed anymore, using the default", "user", userID, "model", model)
		return m.analyzers[m.def], m.def, nil
	}
	return m.analyzers[model], model, nil
}

// Assign sets the user's model (nil = back to the default). The model must be one of the allowed ones.
func (m *ModelSet) Assign(userID string, model *string) error {
	var n int64
	if err := m.db.Model(&platform.User{}).Where("id = ?", userID).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return &platform.Error{Status: 404, Code: "NOT_FOUND", Message: "사용자가 없어요"}
	}
	if model == nil {
		return m.db.Where("user_id = ?", userID).Delete(&UserModel{}).Error
	}
	if !m.allowed(*model) {
		return platform.Invalid("model", fmt.Sprintf("허용된 모델이 아니에요: %v", m.order))
	}
	return m.db.Save(&UserModel{UserID: userID, Model: *model, UpdatedAt: time.Now()}).Error
}
