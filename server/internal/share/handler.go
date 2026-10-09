package share

import (
	"fmt"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// baseURL is PUBLIC_BASE_URL, or the address the request came in on (behind a proxy: X-Forwarded-Proto/Host).
func (s *Service) baseURL(r *http.Request) string {
	if s.base != "" {
		return s.base
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if p := r.Header.Get("X-Forwarded-Proto"); p != "" {
		scheme = p
	}
	host := r.Host
	if h := r.Header.Get("X-Forwarded-Host"); h != "" {
		host = h
	}
	return scheme + "://" + host
}

// Register adds the owner's settings API and the public page.
//
//	GET    /api/share         → {enabled, token, url}
//	POST   /api/share         → turn on (creates the address the first time)
//	DELETE /api/share         → turn off (the address answers 404)
//	POST   /api/share/rotate  → new address, the old one stops working
//	GET    /s/{token}         → public HTML page (no login)
//	GET    /s/{token}/photo?date=&index= → a shared meal's photo
func Register(mux *http.ServeMux, svc *Service) {
	api := func(f func(uid, base string) (Status, error)) http.HandlerFunc {
		return platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
			st, err := f(uid, svc.baseURL(r))
			if err != nil {
				return err
			}
			platform.JSON(w, http.StatusOK, st)
			return nil
		})
	}
	mux.HandleFunc("GET /api/share", api(svc.Get))
	mux.HandleFunc("POST /api/share", api(svc.Enable))
	mux.HandleFunc("DELETE /api/share", api(svc.Disable))
	mux.HandleFunc("POST /api/share/rotate", api(svc.Rotate))

	mux.HandleFunc("GET /s/{token}", func(w http.ResponseWriter, r *http.Request) {
		token := r.PathValue("token")
		uid, err := svc.owner(token)
		if err != nil {
			notFoundPage(w)
			return
		}
		p, err := svc.page(uid)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "private, max-age=60")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		w.Header().Set("Referrer-Policy", "no-referrer")
		_ = pageTmpl.Execute(w, view(p, token, svc.clock.Loc))
	})
	mux.HandleFunc("GET /s/{token}/photo", func(w http.ResponseWriter, r *http.Request) {
		date, err := platform.QueryDate(r, "date")
		idx, ierr := strconv.Atoi(r.URL.Query().Get("index"))
		if err != nil || ierr != nil {
			http.NotFound(w, r)
			return
		}
		data, ct, err := svc.photo(r.Context(), r.PathValue("token"), date, idx)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, max-age=300")
		w.Header().Set("X-Robots-Tag", "noindex")
		_, _ = w.Write(data)
	})
}

func notFoundPage(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	w.WriteHeader(http.StatusNotFound)
	_ = notFoundTmpl.Execute(w, nil)
}

type mealView struct {
	Label    string
	Time     string
	Foods    string
	Kcal     string
	Macros   string
	PhotoURL string
}

type dayView struct {
	Title  string
	Kcal   string
	Macros string
	Meals  []mealView
	Gym    string
}

type pageView struct {
	Name  string
	Days  []dayView
	Range int
}

var weekdays = []string{"일", "월", "화", "수", "목", "금", "토"}

func comma(n int) string {
	s := strconv.Itoa(n)
	if n < 1000 {
		return s
	}
	return s[:len(s)-3] + "," + s[len(s)-3:]
}

func roundKcal(n int) int { return (n + 5) / 10 * 10 }

func macros(n meal.Nutrition) string {
	return fmt.Sprintf("탄 %dg · 단 %dg · 지 %dg", n.Carbs, n.Protein, n.Fat)
}

func view(p Page, token string, loc *time.Location) pageView {
	v := pageView{Name: p.Name, Range: Days}
	if v.Name == "" {
		v.Name = "FitDoing 사용자"
	}
	for _, d := range p.Days {
		t, _ := time.ParseInLocation("2006-01-02", string(d.Date), loc)
		dv := dayView{
			Title:  fmt.Sprintf("%d월 %d일 %s요일", t.Month(), t.Day(), weekdays[t.Weekday()]),
			Kcal:   comma(roundKcal(d.Total.Kcal)),
			Macros: macros(d.Total),
		}
		for _, m := range d.Meals {
			mv := mealView{
				Label:  fmt.Sprintf("%d끼", m.Index),
				Time:   m.LoggedAt.In(loc).Format("15:04"),
				Foods:  strings.Join(m.Foods, " · "),
				Kcal:   comma(roundKcal(m.Nutrition.Kcal)),
				Macros: macros(m.Nutrition),
			}
			if mv.Foods == "" {
				mv.Foods = "음식 이름 없음"
			}
			if m.HasPhoto {
				mv.PhotoURL = fmt.Sprintf("/s/%s/photo?date=%s&index=%d", token, d.Date, m.Index)
			}
			dv.Meals = append(dv.Meals, mv)
		}
		if d.Gym != nil {
			dv.Gym = d.Gym.In(loc).Format("15:04") + " 헬스 인증 완료"
		}
		v.Days = append(v.Days, dv)
	}
	return v
}

// 앱과 같은 색·간격 (다크 #191919 / 카드 #202020 …, 라이트는 같은 의미의 밝은 색). 그림자·그라데이션 없음.
const css = `
:root{--bg:#F4F4F2;--card:#FFFFFF;--text:#2F2E2B;--sub:#787774;--line:#EDECEA;--faint:#B4B2AD}
@media (prefers-color-scheme:dark){:root{--bg:#191919;--card:#202020;--text:#F0EFED;--sub:#ADA9A3;--line:#2C2C2B;--faint:#6E6C68}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:560px;margin:0 auto;padding:40px 24px 56px}
.brand{font-size:13px;color:var(--sub);letter-spacing:.02em}
h1{font-size:24px;line-height:32px;font-weight:700;margin-top:8px}
.desc{font-size:14px;color:var(--sub);margin-top:6px}
section{margin-top:32px}
.day{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.day h2{font-size:18px;font-weight:600}
.num{font-variant-numeric:tabular-nums}
.total{font-size:13px;color:var(--sub);text-align:right}
.total b{color:var(--text);font-weight:600}
.meal{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.meal img,.ph{width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none;background:var(--card)}
.ph{display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:12px}
.mtop{font-size:13px;color:var(--sub)}
.mtop b{color:var(--text);font-weight:600;margin-right:4px}
.foods{font-size:16px;line-height:22px;margin-top:2px;word-break:keep-all}
.nut{font-size:13px;color:var(--sub);margin-top:2px}
.gym{font-size:14px;color:var(--sub);padding:12px 0;border-bottom:1px solid var(--line)}
.empty{margin-top:40px;font-size:15px;color:var(--sub)}
footer{margin-top:40px;font-size:12px;color:var(--faint)}
`

var pageTmpl = template.Must(template.New("page").Parse(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>{{.Name}}의 식단 · FitDoing</title>
<style>` + css + `</style></head>
<body><main>
<div class="brand">FitDoing</div>
<h1>{{.Name}}의 식단</h1>
<p class="desc">최근 {{.Range}}일 동안 공유한 끼니예요.</p>
{{if not .Days}}<p class="empty">아직 공유한 끼니가 없어요.</p>{{end}}
{{range .Days}}<section>
<div class="day"><h2>{{.Title}}</h2><div class="total num"><b>{{.Kcal}} kcal</b><br>{{.Macros}}</div></div>
{{range .Meals}}<div class="meal">
{{if .PhotoURL}}<img src="{{.PhotoURL}}" alt="" loading="lazy">{{else}}<div class="ph">사진 없음</div>{{end}}
<div><div class="mtop num"><b>{{.Label}}</b>{{.Time}}</div><div class="foods">{{.Foods}}</div><div class="nut num">{{.Kcal}} kcal · {{.Macros}}</div></div>
</div>{{end}}
{{if .Gym}}<div class="gym num">{{.Gym}}</div>{{end}}
</section>{{end}}
<footer>추정 영양이에요. 이 페이지는 링크를 아는 사람만 볼 수 있어요.</footer>
</main></body></html>`))

var notFoundTmpl = template.Must(template.New("nf").Parse(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>FitDoing</title><style>` + css + `</style></head>
<body><main><div class="brand">FitDoing</div><h1>볼 수 없는 페이지예요</h1>
<p class="desc">링크가 꺼졌거나 바뀌었어요.</p></main></body></html>`))
