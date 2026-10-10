package photo

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

const (
	maxPhoto   = 5 << 20
	maxRequest = 6 << 20
)

// MealPhoto is the backed-up photo of one meal slot (table meal_photos). The bytes live in the Store under Key.
type MealPhoto struct {
	UserID      string        `gorm:"column:user_id;size:64;primaryKey"`
	Date        platform.Date `gorm:"column:meal_date;size:10;primaryKey"`
	Index       int           `gorm:"column:meal_index;primaryKey"`
	Key         string        `gorm:"column:object_key;not null"`
	ContentType string        `gorm:"column:content_type;not null"`
	Size        int           `gorm:"column:size;not null"`
	CreatedAt   time.Time     `gorm:"column:created_at;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (MealPhoto) TableName() string { return "meal_photos" }

func Models() []any { return []any{&MealPhoto{}} }

// Ref names a backed-up photo in the sync snapshot; the app downloads it with GET /api/meals/photo.
type Ref struct {
	Date  platform.Date `json:"date"`
	Index int           `json:"index"`
}

// Service keeps meal_photos and the Store in step. store is nil when photo backup is not configured on this server.
type Service struct {
	db    *gorm.DB
	store Store
}

func NewService(db *gorm.DB, store Store) *Service { return &Service{db, store} }

var errUnavailable = &platform.Error{Status: http.StatusServiceUnavailable, Code: "PHOTO_BACKUP_UNAVAILABLE",
	Message: "이 서버에서는 사진 백업을 쓸 수 없어요"}

func (s *Service) ready() error {
	if s.store == nil {
		return errUnavailable
	}
	return nil
}

// Put stores the photo of (date, index), replacing an earlier one (its object is deleted after the row is updated).
func (s *Service) Put(ctx context.Context, userID string, date platform.Date, index int, data []byte, contentType string) error {
	if err := s.ready(); err != nil {
		return err
	}
	key := fmt.Sprintf("u/%s/%s_%d_%d.jpg", userID, date, index, time.Now().UnixNano())
	if err := s.store.Put(ctx, key, data, contentType); err != nil {
		return err
	}
	var old MealPhoto
	found := s.db.Where("user_id = ? AND meal_date = ? AND meal_index = ?", userID, date, index).First(&old).Error == nil
	row := MealPhoto{UserID: userID, Date: date, Index: index, Key: key, ContentType: contentType, Size: len(data),
		CreatedAt: time.Now().UTC()}
	if err := s.db.Omit("User").Save(&row).Error; err != nil {
		_ = s.store.Delete(ctx, key)
		return err
	}
	if found && old.Key != key {
		s.dropObject(ctx, old.Key)
	}
	return nil
}

// Get returns the photo bytes and content type, 404 PHOTO_NOT_FOUND when there is none.
func (s *Service) Get(ctx context.Context, userID string, date platform.Date, index int) ([]byte, string, error) {
	if err := s.ready(); err != nil {
		return nil, "", err
	}
	var row MealPhoto
	err := s.db.Where("user_id = ? AND meal_date = ? AND meal_index = ?", userID, date, index).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, "", notFound
	}
	if err != nil {
		return nil, "", err
	}
	b, err := s.store.Get(ctx, row.Key)
	if errors.Is(err, ErrNotFound) {
		return nil, "", notFound
	}
	return b, row.ContentType, err
}

var notFound = &platform.Error{Status: http.StatusNotFound, Code: "PHOTO_NOT_FOUND", Message: "백업한 사진이 없어요"}

// Delete removes the photo of (date, index); a missing photo is fine.
func (s *Service) Delete(ctx context.Context, userID string, date platform.Date, index int) error {
	var rows []MealPhoto
	if err := s.db.Where("user_id = ? AND meal_date = ? AND meal_index = ?", userID, date, index).Find(&rows).Error; err != nil {
		return err
	}
	return s.drop(ctx, rows)
}

// DeleteAll removes every backed-up photo of the user (backup turned off, account deleted).
func (s *Service) DeleteAll(ctx context.Context, userID string) error {
	var rows []MealPhoto
	if err := s.db.Where("user_id = ?", userID).Find(&rows).Error; err != nil {
		return err
	}
	return s.drop(ctx, rows)
}

func (s *Service) drop(ctx context.Context, rows []MealPhoto) error {
	for _, r := range rows {
		if err := s.db.Delete(&MealPhoto{}, "user_id = ? AND meal_date = ? AND meal_index = ?", r.UserID, r.Date, r.Index).Error; err != nil {
			return err
		}
		s.dropObject(ctx, r.Key)
	}
	return nil
}

// dropObject deletes stored bytes. The row is already gone, so a failure only leaves an unreachable object: logged.
func (s *Service) dropObject(ctx context.Context, key string) {
	if s.store == nil {
		return
	}
	if err := s.store.Delete(ctx, key); err != nil {
		slog.Warn("photo object delete failed", "key", key, "err", err)
	}
}

// Refs lists the user's backed-up photos (for the sync snapshot).
func (s *Service) Refs(userID string) ([]Ref, error) {
	var rows []MealPhoto
	if err := s.db.Where("user_id = ?", userID).Order("meal_date, meal_index").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Ref, len(rows))
	for i, r := range rows {
		out[i] = Ref{r.Date, r.Index}
	}
	return out, nil
}

func slot(r *http.Request) (platform.Date, int, error) {
	date, err := platform.QueryDate(r, "date")
	if err != nil {
		return "", 0, err
	}
	idx, err := strconv.Atoi(r.URL.Query().Get("index"))
	if err != nil || idx < 1 || idx > meal.MaxIndex {
		return "", 0, platform.Invalid("index", "1~9 사이 숫자여야 해요")
	}
	return date, idx, nil
}

// Register adds the photo backup routes. The app uploads only when the user turned photo backup on.
//
//	PUT    /api/meals/photo?date=&index=   multipart "photo" (jpeg/png, 5MB 이하) → 204
//	GET    /api/meals/photo?date=&index=   → image bytes
//	DELETE /api/meals/photo?date=&index=   → 204
//	DELETE /api/meals/photos               → 204 (backup turned off: every photo of the user)
func Register(mux *http.ServeMux, svc *Service) {
	mux.HandleFunc("PUT /api/meals/photo", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, idx, err := slot(r)
		if err != nil {
			return err
		}
		data, ct, err := readPhoto(w, r)
		if err != nil {
			return err
		}
		if err := svc.Put(r.Context(), uid, date, idx, data, ct); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
	mux.HandleFunc("GET /api/meals/photo", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, idx, err := slot(r)
		if err != nil {
			return err
		}
		data, ct, err := svc.Get(r.Context(), uid, date, idx)
		if err != nil {
			return err
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, no-store")
		_, _ = w.Write(data)
		return nil
	}))
	mux.HandleFunc("DELETE /api/meals/photo", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		date, idx, err := slot(r)
		if err != nil {
			return err
		}
		if err := svc.Delete(r.Context(), uid, date, idx); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
	mux.HandleFunc("DELETE /api/meals/photos", platform.WithUser(func(w http.ResponseWriter, r *http.Request, uid string) error {
		if err := svc.DeleteAll(r.Context(), uid); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}))
}

func tooLarge() error {
	return &platform.Error{Status: http.StatusRequestEntityTooLarge, Code: "PHOTO_TOO_LARGE", Message: "사진이 너무 커요"}
}

// readPhoto reads the multipart "photo" fully in memory (nothing is spilled to a temp file).
func readPhoto(w http.ResponseWriter, r *http.Request) ([]byte, string, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequest)
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
		var big *http.MaxBytesError
		if errors.As(err, &big) {
			return nil, "", tooLarge()
		}
		return nil, "", platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
	}
	defer file.Close()
	if header.Size > maxPhoto {
		return nil, "", tooLarge()
	}
	ct := header.Header.Get("Content-Type")
	if ct != "image/jpeg" && ct != "image/png" {
		return nil, "", platform.BadRequest("INVALID_PHOTO", "JPEG나 PNG 사진이어야 해요")
	}
	data, err := io.ReadAll(file)
	if err != nil || len(data) == 0 {
		return nil, "", platform.BadRequest("INVALID_PHOTO", "사진 파일이 필요해요")
	}
	if !strings.HasPrefix(http.DetectContentType(data), "image/") {
		return nil, "", platform.BadRequest("INVALID_PHOTO", "사진 파일이 아니에요")
	}
	return data, ct, nil
}
