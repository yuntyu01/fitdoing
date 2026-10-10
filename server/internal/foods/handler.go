package foods

import (
	"errors"
	"log/slog"
	"math"
	"net/http"
	"regexp"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

var barcodeRe = regexp.MustCompile(`^\d{8,14}$`)

// Answer of a barcode lookup: the product, and when its nutrients are known, the same shape as a photo analysis
// so the app fills the meal the same way. result is null when only the product is known.
type Answer struct {
	Product Product    `json:"product"`
	Result  *ai.Result `json:"result"`
}

func resultOf(p Product) *ai.Result {
	if p.Nutrition == nil {
		return nil
	}
	r := func(x float64) int { return int(math.Round(x)) }
	n := p.Nutrition
	k, c, pr, f := r(n.Kcal), r(n.Carbs), r(n.Protein), r(n.Fat)
	amount := p.Amount
	return &ai.Result{
		Items: []ai.Item{{Name: p.Name, Amount: amount, Kcal: &k, Carbs: &c, Protein: &pr, Fat: &f}},
		Kcal:  k, Carbs: c, Protein: pr, Fat: f,
		Confidence: 1,
	}
}

func Register(mux *http.ServeMux, l *Lookup) {
	// GET /api/foods/barcode/{code}: product + nutrition from the public food data (login required).
	mux.HandleFunc("GET /api/foods/barcode/{code}", platform.WithUser(func(w http.ResponseWriter, r *http.Request, _ string) error {
		code := r.PathValue("code")
		if !barcodeRe.MatchString(code) {
			return platform.Invalid("code", "바코드는 숫자 8~14자리예요")
		}
		if !l.Enabled() {
			return &platform.Error{Status: http.StatusServiceUnavailable, Code: "BARCODE_LOOKUP_UNAVAILABLE",
				Message: "바코드로 제품을 찾을 수 없어요. 영양성분표를 찍거나 직접 입력해 주세요"}
		}
		p, err := l.Find(r.Context(), code)
		switch {
		case errors.Is(err, ErrNotFound):
			return &platform.Error{Status: http.StatusNotFound, Code: "BARCODE_NOT_FOUND",
				Message: "등록된 제품이 아니에요. 영양성분표를 찍거나 직접 입력해 주세요"}
		case err != nil && p.Name == "":
			slog.Warn("barcode lookup failed", "err", err)
			return &platform.Error{Status: http.StatusBadGateway, Code: "BARCODE_LOOKUP_FAILED",
				Message: "제품을 찾지 못했어요. 잠시 뒤 다시 해 주세요"}
		case err != nil:
			// the product is known; only its nutrients failed — answer with the name
			slog.Warn("nutrient lookup failed", "err", err)
		}
		platform.JSON(w, http.StatusOK, Answer{Product: p, Result: resultOf(p)})
		return nil
	}))
}
