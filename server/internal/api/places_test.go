package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/places"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// fakeKakao answers like the Kakao Local keyword search and remembers the last request.
func fakeKakao(t *testing.T, status int) (*httptest.Server, *http.Request) {
	t.Helper()
	last := &http.Request{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*last = *r.Clone(r.Context())
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"documents":[
		  {"place_name":"바디핏짐 성수점","address_name":"서울 성동구 성수동2가 1","road_address_name":"서울 성동구 연무장길 1","x":"127.0557","y":"37.5446","distance":"120","category_name":"스포츠,레저 > 헬스클럽"},
		  {"place_name":"지번만 있는 곳","address_name":"서울 성동구 성수동1가 2","road_address_name":"","x":"127.05","y":"37.54","distance":"","category_name":""},
		  {"place_name":"좌표가 깨진 곳","address_name":"x","road_address_name":"","x":"bad","y":"37.5","distance":"","category_name":""}
		]}`))
	}))
	t.Cleanup(srv.Close)
	return srv, last
}

func newPlacesEnv(t *testing.T, key, base string) *env {
	t.Helper()
	db, err := platform.OpenDB("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, db: db}
	e.srv = New(db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, newAuth(db), Options{Places: places.New(key, base)})
	e.tok, e.uid = e.login("someone")
	return e
}

func TestPlaceSearch(t *testing.T) {
	kakao, last := fakeKakao(t, http.StatusOK)
	e := newPlacesEnv(t, "rest-key-123", kakao.URL)

	r := e.get("/api/places/search?q=바디핏짐&lat=37.54&lng=127.05").is(t, 200)
	if last.Header.Get("Authorization") != "KakaoAK rest-key-123" {
		t.Fatalf("auth header: %q", last.Header.Get("Authorization"))
	}
	if q := last.URL.Query(); q.Get("query") != "바디핏짐" || q.Get("y") != "37.540000" || q.Get("x") != "127.050000" || q.Get("sort") != "distance" {
		t.Fatalf("kakao query: %v", last.URL.RawQuery)
	}
	r.size(t, "places", 2) // the one with broken coordinates is dropped
	r.eq(t, "places.0.name", "바디핏짐 성수점")
	r.eq(t, "places.0.address", "서울 성동구 연무장길 1") // road address first
	r.eq(t, "places.0.lat", 37.5446)
	r.eq(t, "places.0.lng", 127.0557)
	r.eq(t, "places.0.distanceM", float64(120))
	r.eq(t, "places.1.address", "서울 성동구 성수동1가 2") // no road address: the lot address

	// without a position: no distance sort, no distance
	r = e.get("/api/places/search?q=헬스").is(t, 200)
	if last.URL.Query().Get("sort") != "" {
		t.Fatal("sorted by distance without a position")
	}
	r.eq(t, "places.0.distanceM", nil)

	e.get("/api/places/search?q=").code(t, 400, "INVALID")
	e.get("/api/places/search?q=a&lat=91&lng=0").code(t, 400, "INVALID")
	e.do("GET", "/api/places/search?q=헬스", "", "").code(t, 401, "UNAUTHORIZED")
}

func TestPlaceSearchOffOrFailing(t *testing.T) {
	newPlacesEnv(t, "", "").get("/api/places/search?q=헬스").code(t, 503, "PLACES_UNAVAILABLE")
	kakao, _ := fakeKakao(t, http.StatusUnauthorized) // e.g. a wrong key
	newPlacesEnv(t, "wrong", kakao.URL).get("/api/places/search?q=헬스").code(t, 502, "PLACES_FAILED")
}
