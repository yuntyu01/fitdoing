package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/foods"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

func newFoodsEnv(t *testing.T, l *foods.Lookup) *env {
	t.Helper()
	db, err := platform.OpenDB("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, db: db}
	e.srv = New(db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, newAuth(db), Options{Foods: l})
	e.tok, e.uid = e.login("someone")
	return e
}

func TestBarcodeAPI(t *testing.T) {
	safety := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.Path) > 0 && r.URL.Path[len(r.URL.Path)-13:] == "8800000000000" {
			_, _ = w.Write([]byte(`{"C005":{"RESULT":{"CODE":"INFO-200"}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"C005":{"row":[{"PRDLST_NM":"바삭칩","BSSH_NM":"제과","PRDLST_REPORT_NO":"1","END_DT":""}],"RESULT":{"CODE":"INFO-000"}}}`))
	}))
	defer safety.Close()
	data := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"header":{"resultCode":"00"},"body":{"items":[{"SERVING_SIZE":"100g","AMT_NUM1":"500","AMT_NUM3":"5","AMT_NUM4":"25","AMT_NUM6":"60","NUTRI_AMOUNT_SERVING":"30g"}]}}`))
	}))
	defer data.Close()
	e := newFoodsEnv(t, foods.New("k1", "k2", safety.URL, data.URL))

	r := e.get("/api/foods/barcode/8801234567890").is(t, 200)
	r.eq(t, "product.name", "바삭칩")
	r.eq(t, "result.kcal", float64(150))
	r.eq(t, "result.items.0.name", "바삭칩")
	r.eq(t, "result.items.0.amount", "1회 섭취참고량 30g")
	r.eq(t, "result.confidence", float64(1))
	e.get("/api/foods/barcode/8800000000000").code(t, 404, "BARCODE_NOT_FOUND")
	e.get("/api/foods/barcode/12ab").code(t, 400, "INVALID")
	e.do("GET", "/api/foods/barcode/8801234567890", "", "").code(t, 401, "UNAUTHORIZED")

	newFoodsEnv(t, foods.New("", "", "", "")).get("/api/foods/barcode/8801234567890").code(t, 503, "BARCODE_LOOKUP_UNAVAILABLE")
}
