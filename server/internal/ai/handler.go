package ai

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

const (
	maxPhoto   = 5 << 20
	maxRequest = MaxPhotos*maxPhoto + 1<<20
)

// Register adds POST /api/meals/analyze. The app sends the meal's photos (1~3, each downscaled to long side 1024px)
// in the "photo" field; one analysis covers them all and the photos are dropped. The model is the one an admin assigned to the user,
// else the default; the response header X-AI-Model names it.
func Register(mux *http.ServeMux, models *ModelSet) {
	mux.HandleFunc("POST /api/meals/analyze", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error { // costs money: login required
		r.Body = http.MaxBytesReader(w, r.Body, maxRequest)
		// Parse fully in memory (limit == request cap) so nothing is spilled to a temp file.
		err := r.ParseMultipartForm(maxRequest)
		if r.MultipartForm != nil {
			defer r.MultipartForm.RemoveAll()
		}
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				return tooLarge()
			}
			return platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
		}
		// one meal may come as up to MaxPhotos photos, all in the "photo" field
		headers := r.MultipartForm.File["photo"]
		if len(headers) == 0 {
			return platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
		}
		if len(headers) > MaxPhotos {
			return platform.BadRequest("TOO_MANY_PHOTOS", fmt.Sprintf("사진은 한 번에 %d장까지예요", MaxPhotos))
		}
		photos := make([]Photo, 0, len(headers))
		for _, h := range headers {
			p, err := readPhoto(h)
			if err != nil {
				return err
			}
			photos = append(photos, p)
		}
		analyzer, model, err := models.For(uid)
		if err != nil {
			return err
		}
		res, err := analyzer.Analyze(r.Context(), photos)
		if err != nil {
			return err
		}
		w.Header().Set("X-AI-Model", model)
		if res.Items == nil {
			res.Items = []Item{}
		}
		platform.JSON(w, http.StatusOK, res)
		return nil
	}))
}

func readPhoto(h *multipart.FileHeader) (Photo, error) {
	if h.Size > maxPhoto {
		return Photo{}, tooLarge()
	}
	contentType := h.Header.Get("Content-Type")
	f, err := h.Open()
	if err != nil {
		return Photo{}, platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil || len(data) == 0 || !strings.HasPrefix(contentType, "image/") {
		return Photo{}, platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
	}
	return Photo{Data: data, ContentType: contentType}, nil
}

func tooLarge() error {
	return &platform.Error{Status: http.StatusRequestEntityTooLarge, Code: "PHOTO_TOO_LARGE", Message: "사진이 너무 커요"}
}
