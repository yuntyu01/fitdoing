package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGeminiSendsInlineImageAndParsesSchema(t *testing.T) {
	var gotKey, gotPath string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey, gotPath = r.Header.Get("x-goog-api-key"), r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"items\":[{\"name\":\"밥\",\"amount\":\"1공기\"}],\"kcal\":300,\"carbs\":60,\"protein\":6,\"fat\":1,\"confidence\":0.7}"}]}}]}`))
	}))
	defer srv.Close()
	g, err := NewGemini("secret", "gemini-2.5-flash", srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	res, err := g.WithBase(srv.URL).Analyze(context.Background(), []byte{1, 2, 3}, "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if res.Kcal != 300 || res.Items[0].Name != "밥" {
		t.Fatalf("got %+v", res)
	}
	if gotKey != "secret" || gotPath != "/models/gemini-2.5-flash:generateContent" {
		t.Fatalf("key=%q path=%q", gotKey, gotPath)
	}
	raw, _ := json.Marshal(body)
	if !strings.Contains(string(raw), `"inline_data"`) || !strings.Contains(string(raw), `"responseSchema"`) ||
		!strings.Contains(string(raw), "AQID") {
		t.Fatalf("unexpected request: %s", raw)
	}
}

func TestGeminiFailureIsBadGateway(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer srv.Close()
	g, _ := NewGemini("k", "m", srv.Client())
	_, err := g.WithBase(srv.URL).Analyze(context.Background(), []byte{1}, "image/png")
	if err == nil || !strings.Contains(err.Error(), "인식") {
		t.Fatalf("got %v", err)
	}
}

func TestGeminiNeedsKey(t *testing.T) {
	if _, err := NewGemini("", "m", nil); err == nil {
		t.Fatal("expected error")
	}
}
