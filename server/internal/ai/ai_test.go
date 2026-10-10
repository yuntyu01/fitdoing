package ai

import (
	"context"
	"encoding/json"
	"fmt"
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
		w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"items\":[{\"name\":\"밥\",\"amount\":\"1공기\",\"kcal\":300,\"carbs\":60,\"protein\":6,\"fat\":1},{\"name\":\"김\",\"amount\":\"1장\",\"kcal\":10,\"carbs\":1,\"protein\":1,\"fat\":1}],\"confidence\":0.7}"}]}}]}`))
	}))
	defer srv.Close()
	g, err := NewGemini("secret", "gemini-2.5-flash", srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	res, err := g.WithBase(srv.URL).Analyze(context.Background(), []Photo{{Data: []byte{1, 2, 3}, ContentType: "image/jpeg"}})
	if err != nil {
		t.Fatal(err)
	}
	// totals are the sum of the foods; each food keeps its own numbers
	if res.Kcal != 310 || res.Carbs != 61 || res.Items[0].Name != "밥" || *res.Items[0].Kcal != 300 || *res.Items[1].Fat != 1 {
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

// Several photos of one meal go into one request, after the prompt that says not to count a food twice.
func TestGeminiSendsAllPhotosOfOneMeal(t *testing.T) {
	var body struct {
		Contents []struct {
			Parts []map[string]any `json:"parts"`
		} `json:"contents"`
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"items\":[],\"confidence\":0}"}]}}]}`))
	}))
	defer srv.Close()
	g, _ := NewGemini("k", "m", srv.Client())
	photos := []Photo{{[]byte{1}, "image/jpeg"}, {[]byte{2}, "image/jpeg"}, {[]byte{3}, "image/png"}}
	if _, err := g.WithBase(srv.URL).Analyze(context.Background(), photos); err != nil {
		t.Fatal(err)
	}
	parts := body.Contents[0].Parts
	if len(parts) != 4 || !strings.Contains(parts[0]["text"].(string), "한 번만 세라") {
		t.Fatalf("parts: %v", parts)
	}
	if one := (&Gemini{}).body(photos[:1]); strings.Contains(fmt.Sprint(one), "한 번만 세라") {
		t.Fatal("a single photo needs no multi-photo instruction")
	}
}

func TestGeminiFailureIsBadGateway(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer srv.Close()
	g, _ := NewGemini("k", "m", srv.Client())
	_, err := g.WithBase(srv.URL).Analyze(context.Background(), []Photo{{Data: []byte{1}, ContentType: "image/png"}})
	if err == nil || !strings.Contains(err.Error(), "인식") {
		t.Fatalf("got %v", err)
	}
}

func TestGeminiNeedsKey(t *testing.T) {
	if _, err := NewGemini("", "m", nil); err == nil {
		t.Fatal("expected error")
	}
}

func TestGeminiResultIsValidated(t *testing.T) {
	cases := map[string]string{
		"missing confidence": `{"items":[]}`,
		"food without kcal":  `{"items":[{"name":"밥","amount":"1공기","carbs":60,"protein":6,"fat":1}],"confidence":0.5}`,
		"negative kcal":      `{"items":[{"name":"밥","amount":"1공기","kcal":-5,"carbs":0,"protein":0,"fat":0}],"confidence":0.5}`,
		"confidence > 1":     `{"items":[],"confidence":95}`,
		"empty item name":    `{"items":[{"name":" ","amount":"1개","kcal":100,"carbs":0,"protein":0,"fat":0}],"confidence":0.5}`,
		"fractional kcal":    `{"items":[{"name":"밥","amount":"1공기","kcal":100.5,"carbs":0,"protein":0,"fat":0}],"confidence":0.5}`,
		"carbs over 1000":    `{"items":[{"name":"밥","amount":"1공기","kcal":100,"carbs":5000,"protein":0,"fat":0}],"confidence":0.5}`,
		"not json":           `밥 한 공기 300kcal`,
	}
	for name, text := range cases {
		if _, err := parseResult(text); err == nil {
			t.Errorf("%s: accepted %s", name, text)
		}
	}
	r, err := parseResult(`{"items":null,"confidence":0}`)
	if err != nil || r.Items == nil || r.Kcal != 0 {
		t.Fatalf("not-food answer: %+v %v", r, err)
	}
}

func TestMockTotalsAreTheSumOfItems(t *testing.T) {
	for _, s := range samples {
		var k, c, p, f int
		for _, it := range s.Items {
			k, c, p, f = k+*it.Kcal, c+*it.Carbs, p+*it.Protein, f+*it.Fat
		}
		if k != s.Kcal || c != s.Carbs || p != s.Protein || f != s.Fat {
			t.Errorf("%v: items sum %d/%d/%d/%d", s.Items[0].Name, k, c, p, f)
		}
	}
}
