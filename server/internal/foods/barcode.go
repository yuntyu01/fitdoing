// Package foods looks a packaged food up by its barcode in the Korean public food data:
//  1. 식품안전나라 C005 (바코드제품정보): barcode -> product name, maker, 품목제조보고번호
//  2. 공공데이터포털 식품의약품안전처_식품영양성분DB정보 (FoodNtrCpntDbInfo03): 품목제조보고번호 -> nutrients
//
// Both need a key (FOODSAFETY_API_KEY, DATA_GO_KR_API_KEY); without them the lookup is off (503) and the app keeps
// the barcode only, as before.
package foods

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	defaultFoodSafety = "http://openapi.foodsafetykorea.go.kr"
	defaultDataGoKr   = "https://apis.data.go.kr"
)

var ErrNotFound = errors.New("barcode not found")

type Nutrition struct {
	Kcal    float64 `json:"kcal"`
	Carbs   float64 `json:"carbs"`
	Protein float64 `json:"protein"`
	Fat     float64 `json:"fat"`
}

// Product is what the lookup found. Nutrition is nil when the product is known but has no nutrient data.
type Product struct {
	Barcode   string     `json:"barcode"`
	Name      string     `json:"name"`
	Maker     string     `json:"maker"`
	ReportNo  string     `json:"reportNo"`
	Amount    string     `json:"amount"` // the amount the nutrition is for, e.g. "1회 섭취참고량 30g"
	Nutrition *Nutrition `json:"nutrition"`
}

type Lookup struct {
	safetyKey, dataKey   string
	safetyBase, dataBase string
	http                 *http.Client
}

// New: the bases are "" for the real services (tests point them at fakes).
func New(safetyKey, dataKey, safetyBase, dataBase string) *Lookup {
	if safetyBase == "" {
		safetyBase = defaultFoodSafety
	}
	if dataBase == "" {
		dataBase = defaultDataGoKr
	}
	return &Lookup{safetyKey: safetyKey, dataKey: dataKey, safetyBase: strings.TrimRight(safetyBase, "/"),
		dataBase: strings.TrimRight(dataBase, "/"), http: &http.Client{Timeout: 8 * time.Second}}
}

func (l *Lookup) Enabled() bool { return l.safetyKey != "" && l.dataKey != "" }

func (l *Lookup) getJSON(ctx context.Context, u string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	resp, err := l.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 2<<20)).Decode(out)
}

// Find looks the barcode up. ErrNotFound when no product has it.
func (l *Lookup) Find(ctx context.Context, barcode string) (Product, error) {
	var c005 struct {
		C005 struct {
			Row []struct {
				Name     string `json:"PRDLST_NM"`
				Maker    string `json:"BSSH_NM"`
				ReportNo string `json:"PRDLST_REPORT_NO"`
				EndDate  string `json:"END_DT"`
			} `json:"row"`
			Result struct {
				Code string `json:"CODE"`
			} `json:"RESULT"`
		} `json:"C005"`
	}
	u := fmt.Sprintf("%s/api/%s/C005/json/1/5/BAR_CD=%s", l.safetyBase, url.PathEscape(l.safetyKey), url.PathEscape(barcode))
	if err := l.getJSON(ctx, u, &c005); err != nil {
		return Product{}, fmt.Errorf("C005: %w", err)
	}
	switch c005.C005.Result.Code {
	case "INFO-000":
	case "INFO-200":
		return Product{}, ErrNotFound
	default:
		return Product{}, fmt.Errorf("C005: %s", c005.C005.Result.Code)
	}
	if len(c005.C005.Row) == 0 {
		return Product{}, ErrNotFound
	}
	// a barcode can be reused: prefer the product still in production
	row := c005.C005.Row[0]
	for _, r := range c005.C005.Row {
		if r.EndDate == "" {
			row = r
			break
		}
	}
	p := Product{Barcode: barcode, Name: row.Name, Maker: row.Maker, ReportNo: row.ReportNo}
	if p.ReportNo == "" {
		return p, nil
	}
	n, amount, err := l.nutrients(ctx, p.ReportNo)
	if err != nil {
		return p, err
	}
	p.Nutrition, p.Amount = n, amount
	return p, nil
}

func (l *Lookup) nutrients(ctx context.Context, reportNo string) (*Nutrition, string, error) {
	v := url.Values{"serviceKey": {l.dataKey}, "type": {"json"}, "pageNo": {"1"}, "numOfRows": {"5"}, "ITEM_REPORT_NO": {reportNo}}
	var raw json.RawMessage
	if err := l.getJSON(ctx, l.dataBase+"/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03?"+v.Encode(), &raw); err != nil {
		return nil, "", fmt.Errorf("nutrient DB: %w", err)
	}
	code, items, err := dataGoKrItems(raw)
	if err != nil {
		return nil, "", fmt.Errorf("nutrient DB: %w", err)
	}
	if code != "" && code != "00" && code != "0" {
		return nil, "", fmt.Errorf("nutrient DB: result %s", code)
	}
	for _, it := range items {
		n, amount, ok := perAmount(it)
		if ok {
			return n, amount, nil
		}
	}
	return nil, "", nil
}

// dataGoKrItems reads the result code and rows of a 공공데이터포털 JSON answer. Services differ: the envelope may be
// wrapped in "response", and items may be an array, {"item": [...]} or {"item": {...}}.
func dataGoKrItems(raw json.RawMessage) (string, []map[string]any, error) {
	var env struct {
		Response *json.RawMessage `json:"response"`
		Header   struct {
			ResultCode string `json:"resultCode"`
		} `json:"header"`
		Body struct {
			Items json.RawMessage `json:"items"`
		} `json:"body"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return "", nil, err
	}
	if env.Response != nil {
		return dataGoKrItems(*env.Response)
	}
	var list []map[string]any
	if len(env.Body.Items) == 0 || string(env.Body.Items) == "null" || string(env.Body.Items) == `""` {
		return env.Header.ResultCode, nil, nil
	}
	if json.Unmarshal(env.Body.Items, &list) == nil {
		return env.Header.ResultCode, list, nil
	}
	var wrap struct {
		Item json.RawMessage `json:"item"`
	}
	if err := json.Unmarshal(env.Body.Items, &wrap); err != nil {
		return "", nil, err
	}
	if json.Unmarshal(wrap.Item, &list) == nil {
		return env.Header.ResultCode, list, nil
	}
	var one map[string]any
	if err := json.Unmarshal(wrap.Item, &one); err != nil {
		return "", nil, err
	}
	return env.Header.ResultCode, []map[string]any{one}, nil
}

var qty = regexp.MustCompile(`([\d.]+)\s*(g|ml|mL|ML|G)`)

func parseQty(s string) (float64, string, bool) {
	m := qty.FindStringSubmatch(s)
	if m == nil {
		return 0, "", false
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil || v <= 0 {
		return 0, "", false
	}
	return v, strings.ToLower(m[2]), true
}

func num(it map[string]any, k string) (float64, bool) {
	switch v := it[k].(type) {
	case float64:
		return v, true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(strings.ReplaceAll(v, ",", "")), 64)
		return f, err == nil
	}
	return 0, false
}

func str(it map[string]any, k string) string {
	s, _ := it[k].(string)
	return strings.TrimSpace(s)
}

// perAmount scales the DB values (given per SERVING_SIZE, usually 100g) to one sitting:
// 1회 섭취참고량 if known, else the whole package (식품중량), else the DB basis itself.
func perAmount(it map[string]any) (*Nutrition, string, bool) {
	kcal, ok1 := num(it, "AMT_NUM1")
	protein, ok2 := num(it, "AMT_NUM3")
	fat, ok3 := num(it, "AMT_NUM4")
	carbs, ok4 := num(it, "AMT_NUM6")
	if !ok1 || !ok2 || !ok3 || !ok4 {
		return nil, "", false
	}
	basis := str(it, "SERVING_SIZE")
	base, unit, ok := parseQty(basis)
	if !ok {
		return nil, "", false
	}
	scale, amount := 1.0, basis+" 기준"
	for _, c := range []struct{ key, label string }{{"NUTRI_AMOUNT_SERVING", "1회 섭취참고량"}, {"Z10500", "1개"}} {
		if v, u, ok := parseQty(str(it, c.key)); ok && u == unit {
			scale, amount = v/base, fmt.Sprintf("%s %s%s", c.label, trimNum(v), unit)
			break
		}
	}
	r := func(x float64) float64 { return math.Round(x*scale*10) / 10 }
	return &Nutrition{Kcal: r(kcal), Carbs: r(carbs), Protein: r(protein), Fat: r(fat)}, amount, true
}

func trimNum(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
