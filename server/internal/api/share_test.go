package api

import (
	"io"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func (e *env) public(path string) (int, string) {
	e.t.Helper()
	w := httptest.NewRecorder()
	e.srv.ServeHTTP(w, httptest.NewRequest("GET", path, nil)) // no Authorization: the page is public
	b, _ := io.ReadAll(w.Body)
	return w.Code, string(b)
}

// todayKey is the test server's today (UTC clock, as in photoEnv).
func todayKey() string { return time.Now().UTC().Format("2006-01-02") }

func sharedMeal(date string, index int, name string, share bool) string {
	s := "false"
	if share {
		s = "true"
	}
	return `{"date":"` + date + `","index":` + strconv.Itoa(index) + `,"portion":1,"sharedMeal":false,"shareFriends":` + s + `,"cheat":false,
	 "ai":{"items":[{"name":"` + name + `","amount":"1인분"}],"kcal":500,"carbs":60,"protein":30,"fat":15,"confidence":0.8}}`
}

func TestSharePageShowsOnlySharedMealsAndCanBeTurnedOffOrRotated(t *testing.T) {
	e, _ := photoEnv(t)
	today := todayKey()
	e.post("/api/meals", sharedMeal(today, 1, "닭가슴살 덮밥", true)).is(t, 200)
	e.post("/api/meals", sharedMeal(today, 2, "비밀 야식", false)).is(t, 200)
	e.upload("/api/meals/photo?date="+today+"&index=1", e.tok, "image/jpeg", jpeg)
	e.upload("/api/meals/photo?date="+today+"&index=2", e.tok, "image/jpeg", jpeg)

	e.get("/api/share").is(t, 200).eq(t, "enabled", false)
	on := e.post("/api/share", "").is(t, 200)
	on.eq(t, "enabled", true)
	token := on.Body["token"].(string)
	if len(token) != 24 || !strings.HasSuffix(on.Body["url"].(string), "/s/"+token) {
		t.Fatalf("status %s", on.Raw)
	}

	code, html := e.public("/s/" + token)
	if code != 200 || !strings.Contains(html, "닭가슴살 덮밥") || strings.Contains(html, "비밀 야식") {
		t.Fatalf("page %d: shared shown / unshared hidden expected\n%s", code, html)
	}
	if !strings.Contains(html, "noindex") {
		t.Fatal("public page must ask search engines not to index it")
	}
	if c, _ := e.public("/s/" + token + "/photo?date=" + today + "&index=1"); c != 200 {
		t.Fatalf("shared photo %d", c)
	}
	if c, _ := e.public("/s/" + token + "/photo?date=" + today + "&index=2"); c != 404 {
		t.Fatalf("unshared photo %d, want 404", c)
	}

	// another user's page is separate; my token is not theirs
	if c, _ := e.public("/s/doesnotexist000000000000"); c != 404 {
		t.Fatalf("unknown token %d", c)
	}

	// off: 404, on again: same address
	e.do("DELETE", "/api/share", "", e.tok).is(t, 200).eq(t, "enabled", false)
	if c, _ := e.public("/s/" + token); c != 404 {
		t.Fatalf("disabled page %d", c)
	}
	e.post("/api/share", "").is(t, 200).eq(t, "token", token)

	// rotate: the old address stops working
	next := e.post("/api/share/rotate", "").is(t, 200).Body["token"].(string)
	if next == token {
		t.Fatal("rotate kept the token")
	}
	if c, _ := e.public("/s/" + token); c != 404 {
		t.Fatalf("old token after rotate %d", c)
	}
	if c, _ := e.public("/s/" + next); c != 200 {
		t.Fatalf("new token %d", c)
	}

	// account deletion removes the link
	e.do("DELETE", "/api/account", "", e.tok).is(t, 204)
	if c, _ := e.public("/s/" + next); c != 404 {
		t.Fatalf("page after account deletion %d", c)
	}
}
