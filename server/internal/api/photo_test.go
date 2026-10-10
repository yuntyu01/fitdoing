package api

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/ai"
	"github.com/yuntyu01/fitdoing/server/internal/photo"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// smallest valid JPEG-looking bytes: DetectContentType only needs the FF D8 FF signature
var jpeg = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0}, 64)...)

// a 1x1 PNG
var png, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

func photoEnv(t *testing.T) (*env, string) {
	t.Helper()
	db, err := platform.OpenDB("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	e := &env{t: t, db: db}
	e.srv = New(db, ai.Mock{}, platform.Clock{Loc: time.UTC}, nil, newAuth(db), Options{PhotoStore: photo.FileStore{Dir: dir}})
	e.tok, e.uid = e.login("main-user")
	return e, dir
}

func (e *env) upload(path, tok, contentType string, data []byte) *httptest.ResponseRecorder {
	e.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", `form-data; name="photo"; filename="meal.jpg"`)
	h.Set("Content-Type", contentType)
	part, _ := mw.CreatePart(h)
	part.Write(data)
	mw.Close()
	req := httptest.NewRequest(http.MethodPut, path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	e.srv.ServeHTTP(w, req)
	return w
}

func (e *env) raw(method, path, tok string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	e.srv.ServeHTTP(w, req)
	return w
}

func files(t *testing.T, dir string) int {
	n := 0
	filepath.WalkDir(dir, func(_ string, d os.DirEntry, _ error) error {
		if d != nil && !d.IsDir() {
			n++
		}
		return nil
	})
	return n
}

func TestPhotoBackupFlow(t *testing.T) {
	e, dir := photoEnv(t)
	const slot = "/api/meals/photo?date=2026-09-26&index=1"

	if w := e.upload(slot, e.tok, "image/jpeg", jpeg); w.Code != 204 {
		t.Fatalf("upload: %d %s", w.Code, w.Body)
	}
	w := e.raw("GET", slot, e.tok)
	if w.Code != 200 || !bytes.Equal(w.Body.Bytes(), jpeg) || w.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("download: %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	e.get("/api/sync/snapshot").is(t, 200).eq(t, "photos.0.index", 1)

	// replacing keeps one object
	if w := e.upload(slot, e.tok, "image/png", png); w.Code != 204 {
		t.Fatalf("replace: %d %s", w.Code, w.Body)
	}
	if n := files(t, dir); n != 1 {
		t.Fatalf("objects after replace = %d, want 1", n)
	}
	got, _ := io.ReadAll(e.raw("GET", slot, e.tok).Body)
	if !bytes.Equal(got, png) {
		t.Fatal("download after replace is not the new photo")
	}

	// another user cannot see it
	if w := e.raw("GET", slot, e.otherToken("other")); w.Code != 404 {
		t.Fatalf("other user: %d", w.Code)
	}

	// deleting the meal deletes its photo
	e.post("/api/meals", mealBody("2026-09-26", 1, 1, 400, false)).is(t, 200)
	e.do("DELETE", "/api/meals?date=2026-09-26&index=1", "", e.tok).is(t, 204)
	if w := e.raw("GET", slot, e.tok); w.Code != 404 || files(t, dir) != 0 {
		t.Fatalf("after meal delete: %d, %d objects", w.Code, files(t, dir))
	}

	// backup turned off: every photo goes
	e.upload("/api/meals/photo?date=2026-09-26&index=2", e.tok, "image/jpeg", jpeg)
	e.upload("/api/meals/photo?date=2026-09-27&index=1", e.tok, "image/jpeg", jpeg)
	if w := e.raw("DELETE", "/api/meals/photos", e.tok); w.Code != 204 || files(t, dir) != 0 || e.count("meal_photos") != 0 {
		t.Fatalf("delete all: %d, %d objects", w.Code, files(t, dir))
	}

	// account deletion removes the objects too
	e.upload("/api/meals/photo?date=2026-09-28&index=1", e.tok, "image/jpeg", jpeg)
	e.do("DELETE", "/api/account", "", e.tok).is(t, 204)
	if files(t, dir) != 0 {
		t.Fatal("photo object left after account deletion")
	}
}

func TestPhotoBackupRefusals(t *testing.T) {
	e, _ := photoEnv(t)
	if w := e.upload("/api/meals/photo?date=2026-09-26&index=1", e.tok, "image/gif", jpeg); w.Code != 400 {
		t.Fatalf("gif: %d", w.Code)
	}
	if w := e.upload("/api/meals/photo?date=2026-09-26&index=1", e.tok, "image/jpeg", []byte("not an image at all")); w.Code != 400 {
		t.Fatalf("text as jpeg: %d", w.Code)
	}
	if w := e.upload("/api/meals/photo?date=2026-09-26&index=10", e.tok, "image/jpeg", jpeg); w.Code != 400 {
		t.Fatalf("index 10: %d", w.Code) // 1~6 planned meals, 7~9 "기타"
	}
	if w := e.upload("/api/meals/photo?date=2026-09-26&index=1", e.tok, "image/jpeg", bytes.Repeat(jpeg, 6<<20/len(jpeg)+1)); w.Code != 413 {
		t.Fatalf("too large: %d", w.Code)
	}
	if w := e.raw("GET", "/api/meals/photo?date=2026-09-26&index=1", e.tok); w.Code != 404 {
		t.Fatalf("missing: %d", w.Code)
	}
}

func TestPhotoBackupOffWithoutStore(t *testing.T) {
	e := newEnv(t) // no PhotoStore configured
	w := e.upload("/api/meals/photo?date=2026-09-26&index=1", e.tok, "image/jpeg", jpeg)
	if w.Code != 503 || !bytes.Contains(w.Body.Bytes(), []byte("PHOTO_BACKUP_UNAVAILABLE")) {
		t.Fatalf("no store: %d %s", w.Code, w.Body)
	}
	e.get("/api/sync/snapshot").is(t, 200).size(t, "photos", 0)
	e.do("DELETE", "/api/meals?date=2026-09-26&index=1", "", e.tok).is(t, 204) // meal delete still works
}
