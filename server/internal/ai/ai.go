// Package ai estimates food and nutrition from a photo. Photos are never stored.
package ai

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

type Item struct {
	Name   string `json:"name"`
	Amount string `json:"amount"`
}

// Result is the fixed JSON schema shared with the app and with Gemini:
// {items:[{name, amount}], kcal, carbs, protein, fat, confidence}.
type Result struct {
	Items      []Item  `json:"items"`
	Kcal       int     `json:"kcal"`
	Carbs      int     `json:"carbs"`
	Protein    int     `json:"protein"`
	Fat        int     `json:"fat"`
	Confidence float64 `json:"confidence"`
}

// Validate applies the request constraints; field is the JSON path prefix, e.g. "ai".
func (r *Result) Validate(field string) error {
	if r.Items == nil {
		return platform.Invalid(field+".items", "필수예요")
	}
	for _, it := range r.Items {
		if strings.TrimSpace(it.Name) == "" {
			return platform.Invalid(field+".items.name", "비어 있으면 안 돼요")
		}
	}
	switch {
	case r.Kcal < 0 || r.Kcal > 10000:
		return platform.Invalid(field+".kcal", "0~10000 사이여야 해요")
	case r.Carbs < 0 || r.Carbs > 1000:
		return platform.Invalid(field+".carbs", "0~1000 사이여야 해요")
	case r.Protein < 0 || r.Protein > 1000:
		return platform.Invalid(field+".protein", "0~1000 사이여야 해요")
	case r.Fat < 0 || r.Fat > 1000:
		return platform.Invalid(field+".fat", "0~1000 사이여야 해요")
	case r.Confidence < 0 || r.Confidence > 1:
		return platform.Invalid(field+".confidence", "0~1 사이여야 해요")
	}
	return nil
}

// FoodAnalyzer looks at a meal photo and estimates items, kcal and macros.
// Implementations are chosen with AI_PROVIDER (mock | gemini). The photo is not stored.
type FoodAnalyzer interface {
	Analyze(ctx context.Context, image []byte, contentType string) (Result, error)
}

// New picks the analyzer for a provider name.
func New(provider, geminiKey, geminiModel string) (FoodAnalyzer, error) {
	switch provider {
	case "mock", "":
		return Mock{}, nil
	case "gemini":
		return NewGemini(geminiKey, geminiModel, http.DefaultClient)
	}
	return nil, fmt.Errorf("AI_PROVIDER는 mock 또는 gemini 여야 해요: %q", provider)
}
