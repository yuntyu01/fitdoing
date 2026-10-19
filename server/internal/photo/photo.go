package photo

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
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
	"gorm.io/gorm/clause"
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

type ObjectDeletion struct {
	Key           string    `gorm:"primaryKey;size:512"`
	UserID        string    `gorm:"size:36;not null;index"`
	PendingUpload bool      `gorm:"not null;default:false"`
	Attempts      int       `gorm:"not null;default:0"`
	NextAttemptAt time.Time `gorm:"not null;index"`
}

func Models() []any { return []any{&MealPhoto{}, &ObjectDeletion{}} }

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
	var owners []platform.User
	if err := s.db.Where("id = ? AND auth_blocked = ?", userID, false).Limit(1).Find(&owners).Error; err != nil {
		return err
	}
	if len(owners) == 0 {
		return &platform.Error{Status: 401, Code: "UNAUTHORIZED", Message: "다시 로그인해 주세요"}
	}
	key := fmt.Sprintf("u/%s/%s_%d_%s.jpg", userID, date, index, uuid.NewString())
	// Persist cleanup intent before the external write, including unknown-outcome timeouts.
	if err := s.db.Create(&ObjectDeletion{Key: key, UserID: userID, PendingUpload: true, NextAttemptAt: time.Now().Add(5 * time.Minute).UTC()}).Error; err != nil {
		return err
	}
	if err := s.store.Put(ctx, key, data, contentType); err != nil {
		return err
	}
	var oldKey string
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var users []platform.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", userID).Limit(1).Find(&users).Error; err != nil {
			return err
		}
		if len(users) != 1 || users[0].AuthBlocked {
			return &platform.Error{Status: 401, Code: "UNAUTHORIZED", Message: "다시 로그인해 주세요"}
		}
		var old []MealPhoto
		if err := tx.Where("user_id = ? AND meal_date = ? AND meal_index = ?", userID, date, index).Limit(1).Find(&old).Error; err != nil {
			return err
		}
		row := MealPhoto{UserID: userID, Date: date, Index: index, Key: key, ContentType: contentType, Size: len(data), CreatedAt: time.Now().UTC()}
		if err := tx.Omit("User").Save(&row).Error; err != nil {
			return err
		}
		if len(old) > 0 && old[0].Key != key {
			oldKey = old[0].Key
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&ObjectDeletion{Key: oldKey, UserID: userID, NextAttemptAt: time.Now().UTC()}).Error; err != nil {
				return err
			}
		}
		return tx.Delete(&ObjectDeletion{}, "key = ?", key).Error
	})
	if err != nil {
		return err
	} // the already-persisted cleanup intent remains for retry
	if oldKey != "" {
		if err := s.cleanupObject(ctx, oldKey); err != nil {
			slog.Warn("replaced photo cleanup queued for retry")
		}
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
	var pending []ObjectDeletion
	if err := s.db.Where("user_id = ?", userID).Find(&pending).Error; err != nil {
		return err
	}
	for _, p := range pending {
		if p.PendingUpload && p.NextAttemptAt.After(time.Now()) {
			return &platform.Error{Status: 503, Code: "PHOTO_CLEANUP_PENDING", Message: "진행 중인 사진 정리를 마친 뒤 다시 처리해요"}
		}
	}
	if s.store == nil {
		if len(rows)+len(pending) > 0 {
			return errUnavailable
		}
		return nil
	}
	prefix := "u/" + userID + "/"
	keys := map[string]bool{}
	for _, r := range rows {
		keys[r.Key] = true
	}
	for _, r := range pending {
		keys[r.Key] = true
	}
	if lister, ok := s.store.(PrefixLister); ok {
		found, err := lister.ListPrefix(ctx, prefix)
		if err != nil {
			return err
		}
		for _, key := range found {
			keys[key] = true
		}
	}
	for key := range keys {
		if !strings.HasPrefix(key, prefix) {
			return errors.New("photo cleanup refused a foreign ownership prefix")
		}
	}
	for key := range keys {
		if err := s.store.Delete(ctx, key); err != nil {
			return err
		}
		if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := tx.Delete(&MealPhoto{}, "user_id = ? AND object_key = ?", userID, key).Error; err != nil {
				return err
			}
			if err := tx.Delete(&ObjectDeletion{}, "user_id = ? AND key = ?", userID, key).Error; err != nil {
				return err
			}
			return nil
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) drop(ctx context.Context, rows []MealPhoto) error {
	for _, r := range rows {
		if !strings.HasPrefix(r.Key, "u/"+r.UserID+"/") {
			return errors.New("photo cleanup refused a foreign ownership prefix")
		}
		if s.store == nil {
			return errUnavailable
		}
		if err := s.store.Delete(ctx, r.Key); err != nil {
			return err
		}
		if err := s.db.Delete(&MealPhoto{}, "user_id = ? AND meal_date = ? AND meal_index = ? AND object_key = ?", r.UserID, r.Date, r.Index, r.Key).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) cleanupObject(ctx context.Context, key string) error {
	var active int64
	if err := s.db.Model(&MealPhoto{}).Where("object_key = ?", key).Count(&active).Error; err != nil {
		return err
	}
	if active == 0 {
		if err := s.store.Delete(ctx, key); err != nil {
			return err
		}
	}
	return s.db.Delete(&ObjectDeletion{}, "key = ?", key).Error
}

func (s *Service) ProcessDeletions(ctx context.Context) error {
	var jobs []ObjectDeletion
	if err := s.db.WithContext(ctx).Where("next_attempt_at <= ?", time.Now().UTC()).Limit(20).Find(&jobs).Error; err != nil {
		return err
	}
	if len(jobs) == 0 {
		return nil
	}
	if err := s.ready(); err != nil {
		return err
	}
	for _, job := range jobs {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !strings.HasPrefix(job.Key, "u/"+job.UserID+"/") {
			return errors.New("photo cleanup refused a foreign ownership prefix")
		}
		if err := s.cleanupObject(ctx, job.Key); err != nil {
			delay := time.Minute * time.Duration(1<<min(job.Attempts, 6))
			if delay > time.Hour {
				delay = time.Hour
			}
			if err := s.db.Model(&ObjectDeletion{}).Where("key = ?", job.Key).Updates(map[string]any{"attempts": gorm.Expr("attempts + 1"), "pending_upload": false, "next_attempt_at": time.Now().Add(delay).UTC()}).Error; err != nil {
				return err
			}
			slog.Warn("photo cleanup queued for retry")
		}
	}
	return nil
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
