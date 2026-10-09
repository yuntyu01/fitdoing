package ai

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

const (
	maxPhoto   = 5 << 20
	maxRequest = 6 << 20
)

// Register adds POST /api/meals/analyze. The app sends a downscaled photo (long side 1024px);
// the result JSON is returned and the photo is dropped.
func Register(mux *http.ServeMux, analyzer FoodAnalyzer) {
	mux.HandleFunc("POST /api/meals/analyze", platform.WithUser(func(w http.ResponseWriter, r *http.Request, _ string) error { // costs money: login required
		r.Body = http.MaxBytesReader(w, r.Body, maxRequest)
		// Parse fully in memory (limit == request cap) so nothing is spilled to a temp file.
		err := r.ParseMultipartForm(maxRequest)
		if r.MultipartForm != nil {
			defer r.MultipartForm.RemoveAll()
		}
		var file multipart.File
		var header *multipart.FileHeader
		if err == nil {
			file, header, err = r.FormFile("photo")
		}
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				return tooLarge()
			}
			return platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
		}
		defer file.Close()
		if header.Size > maxPhoto {
			return tooLarge()
		}
		contentType := header.Header.Get("Content-Type")
		data, err := io.ReadAll(file)
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				return tooLarge()
			}
			return platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
		}
		if len(data) == 0 || !strings.HasPrefix(contentType, "image/") {
			return platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
		}
		res, err := analyzer.Analyze(r.Context(), data, contentType)
		if err != nil {
			return err
		}
		if res.Items == nil {
			res.Items = []Item{}
		}
		platform.JSON(w, http.StatusOK, res)
		return nil
	}))
}

func tooLarge() error {
	return &platform.Error{Status: http.StatusRequestEntityTooLarge, Code: "PHOTO_TOO_LARGE", Message: "사진이 너무 커요"}
}
