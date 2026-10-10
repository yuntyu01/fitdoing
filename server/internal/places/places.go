// Package places searches places by name (the gym of the gym plan) with the Kakao Local keyword search.
// The REST API key stays on the server; the app sends the query (and, if it has one, a rough position to sort
// by distance). Nothing is stored.
package places

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

const defaultBase = "https://dapi.kakao.com"

type Place struct {
	Name      string   `json:"name"`
	Address   string   `json:"address"` // road address when there is one
	Lat       float64  `json:"lat"`
	Lng       float64  `json:"lng"`
	Category  string   `json:"category"`
	DistanceM *float64 `json:"distanceM"` // only when the request had a position
}

type Searcher struct {
	key  string
	base string
	http *http.Client
}

// New: key is KAKAO_REST_API_KEY ("" = search off, 503). base "" = Kakao; tests point it at a fake.
func New(key, base string) *Searcher {
	if base == "" {
		base = defaultBase
	}
	return &Searcher{key: key, base: strings.TrimRight(base, "/"), http: &http.Client{Timeout: 8 * time.Second}}
}

func (s *Searcher) Enabled() bool { return s.key != "" }

// Search: near is optional (lat, lng) to sort by distance.
func (s *Searcher) Search(ctx context.Context, q string, near *[2]float64) ([]Place, error) {
	v := url.Values{"query": {q}, "size": {"15"}}
	if near != nil {
		v.Set("y", strconv.FormatFloat(near[0], 'f', 6, 64))
		v.Set("x", strconv.FormatFloat(near[1], 'f', 6, 64))
		v.Set("sort", "distance")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.base+"/v2/local/search/keyword.json?"+v.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "KakaoAK "+s.key)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kakao local status %d", resp.StatusCode)
	}
	var body struct {
		Documents []struct {
			PlaceName   string `json:"place_name"`
			AddressName string `json:"address_name"`
			RoadAddress string `json:"road_address_name"`
			X           string `json:"x"`
			Y           string `json:"y"`
			Distance    string `json:"distance"`
			Category    string `json:"category_name"`
		} `json:"documents"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1<<20)).Decode(&body); err != nil {
		return nil, err
	}
	out := make([]Place, 0, len(body.Documents))
	for _, d := range body.Documents {
		lng, err1 := strconv.ParseFloat(d.X, 64)
		lat, err2 := strconv.ParseFloat(d.Y, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		p := Place{Name: d.PlaceName, Address: d.RoadAddress, Lat: lat, Lng: lng, Category: d.Category}
		if p.Address == "" {
			p.Address = d.AddressName
		}
		if dist, err := strconv.ParseFloat(d.Distance, 64); err == nil && near != nil {
			p.DistanceM = &dist
		}
		out = append(out, p)
	}
	return out, nil
}

func Register(mux *http.ServeMux, s *Searcher) {
	// GET /api/places/search?q=<name>[&lat=&lng=] (login required: it costs a quota)
	mux.HandleFunc("GET /api/places/search", platform.WithUser(func(w http.ResponseWriter, r *http.Request, _ string) error {
		if !s.Enabled() {
			return &platform.Error{Status: http.StatusServiceUnavailable, Code: "PLACES_UNAVAILABLE",
				Message: "장소 검색을 쓸 수 없어요. 지금 위치로 정해 주세요"}
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" || utf8.RuneCountInString(q) > 50 {
			return platform.Invalid("q", "1~50자로 입력해 주세요")
		}
		var near *[2]float64
		if ls, gs := r.URL.Query().Get("lat"), r.URL.Query().Get("lng"); ls != "" || gs != "" {
			lat, err1 := strconv.ParseFloat(ls, 64)
			lng, err2 := strconv.ParseFloat(gs, 64)
			if err1 != nil || err2 != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
				return platform.Invalid("lat", "위치가 잘못됐어요")
			}
			near = &[2]float64{lat, lng}
		}
		list, err := s.Search(r.Context(), q, near)
		if err != nil {
			slog.Warn("place search failed", "err", err)
			return &platform.Error{Status: http.StatusBadGateway, Code: "PLACES_FAILED", Message: "장소를 찾지 못했어요. 잠시 뒤 다시 해 주세요"}
		}
		platform.JSON(w, http.StatusOK, map[string]any{"places": list})
		return nil
	}))
}
