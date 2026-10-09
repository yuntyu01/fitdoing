package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// 음식마다 칼로리·탄단지를 따로 받고 끼니 합계는 서버에서 더한다. 합계만 받을 때와 정확도는 같았고(2026-10-09,
// 실사진 42장), 음식별 값은 나중에 식단 피드백에 쓴다.
const prompt = `식단 사진이다. 보이는 음식(음료 포함)을 하나씩 나열하고, 각 음식마다 이름, 양, 칼로리(kcal), 탄수화물·단백질·지방(g)을 추정해라.
음식이 아니면 items를 비우고 confidence는 0으로 답해라. 한국어로 답해라.`

const geminiBase = "https://generativelanguage.googleapis.com/v1beta"

// Gemini calls generateContent with the photo inline (base64) and a fixed responseSchema.
// The API key stays on the server.
type Gemini struct {
	key, model, base string
	http             *http.Client
}

func NewGemini(key, model string, client *http.Client) (*Gemini, error) {
	if key == "" {
		return nil, errors.New("GEMINI_API_KEY가 필요해요")
	}
	if client == nil {
		client = &http.Client{}
	}
	return &Gemini{key: key, model: model, base: geminiBase, http: client}, nil
}

// WithBase overrides the API base URL (tests).
func (g *Gemini) WithBase(base string) *Gemini { g.base = base; return g }

func obj(props map[string]any, required ...string) map[string]any {
	return map[string]any{"type": "OBJECT", "properties": props, "required": required}
}

func (g *Gemini) body(image []byte, contentType string) map[string]any {
	str := map[string]any{"type": "STRING"}
	num := map[string]any{"type": "INTEGER"}
	item := obj(map[string]any{"name": str, "amount": str, "kcal": num, "carbs": num, "protein": num, "fat": num},
		"name", "amount", "kcal", "carbs", "protein", "fat")
	schema := obj(map[string]any{
		"items":      map[string]any{"type": "ARRAY", "items": item},
		"confidence": map[string]any{"type": "NUMBER"},
	}, "items", "confidence")
	return map[string]any{
		"contents": []any{map[string]any{"parts": []any{
			map[string]any{"text": prompt},
			map[string]any{"inline_data": map[string]any{
				"mime_type": contentType, "data": base64.StdEncoding.EncodeToString(image)}},
		}}},
		"generationConfig": map[string]any{"responseMimeType": "application/json", "responseSchema": schema},
	}
}

func (g *Gemini) Analyze(ctx context.Context, image []byte, contentType string) (Result, error) {
	res, err := g.call(ctx, image, contentType)
	if err != nil {
		slog.Warn("gemini analyze failed", "err", err)
		return Result{}, &platform.Error{Status: http.StatusBadGateway, Code: "AI_FAILED",
			Message: "음식 인식에 실패했어요. 직접 입력해 주세요"}
	}
	return res, nil
}

func (g *Gemini) call(ctx context.Context, image []byte, contentType string) (Result, error) {
	payload, err := json.Marshal(g.body(image, contentType))
	if err != nil {
		return Result{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	u := fmt.Sprintf("%s/models/%s:generateContent", g.base, url.PathEscape(g.model))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(payload))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", g.key)
	resp, err := g.http.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Result{}, err
	}
	if resp.StatusCode/100 != 2 {
		return Result{}, fmt.Errorf("gemini status %d", resp.StatusCode)
	}
	var out struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return Result{}, err
	}
	if len(out.Candidates) == 0 || len(out.Candidates[0].Content.Parts) == 0 {
		return Result{}, errors.New("gemini: empty response")
	}
	return parseResult(out.Candidates[0].Content.Parts[0].Text)
}

// parseResult checks the model's JSON like the app's request is checked: every food has a name and all four numbers,
// ranges via Result.Validate. The meal's totals are the sum of the foods. responseSchema usually holds, but a model
// can still drop a number (json would leave it 0) or return an out-of-range one; both become AI_FAILED instead of a
// silent 0 kcal.
func parseResult(text string) (Result, error) {
	var raw struct {
		Items []struct {
			Name    string `json:"name"`
			Amount  string `json:"amount"`
			Kcal    *int   `json:"kcal"`
			Carbs   *int   `json:"carbs"`
			Protein *int   `json:"protein"`
			Fat     *int   `json:"fat"`
		} `json:"items"` // absent or null = nothing recognised
		Confidence *float64 `json:"confidence"`
	}
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return Result{}, err
	}
	if raw.Confidence == nil {
		return Result{}, fmt.Errorf("gemini: missing confidence in %q", text)
	}
	r := Result{Items: []Item{}, Confidence: *raw.Confidence}
	for _, it := range raw.Items {
		if it.Kcal == nil || it.Carbs == nil || it.Protein == nil || it.Fat == nil {
			return Result{}, fmt.Errorf("gemini: food without numbers in %q", text)
		}
		r.Items = append(r.Items, Item{Name: it.Name, Amount: it.Amount, Kcal: it.Kcal, Carbs: it.Carbs, Protein: it.Protein, Fat: it.Fat})
		r.Kcal += *it.Kcal
		r.Carbs += *it.Carbs
		r.Protein += *it.Protein
		r.Fat += *it.Fat
	}
	if err := r.Validate("ai"); err != nil {
		return Result{}, fmt.Errorf("gemini: %w", err)
	}
	return r, nil
}
