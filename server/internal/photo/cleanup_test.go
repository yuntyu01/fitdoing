package photo

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/auth"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"gorm.io/gorm"
)

type cleanupVerifier struct{}

func (cleanupVerifier) Verify(_ context.Context, token string) (string, error) { return token, nil }

type cleanupStore struct {
	mu               sync.Mutex
	objects          map[string][]byte
	failDelete       bool
	entered, release chan struct{}
}

func (s *cleanupStore) Put(ctx context.Context, key string, data []byte, _ string) error {
	if s.entered != nil {
		close(s.entered)
		select {
		case <-s.release:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[key] = append([]byte(nil), data...)
	return nil
}
func (s *cleanupStore) Get(_ context.Context, key string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.objects[key], nil
}
func (s *cleanupStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failDelete {
		return errors.New("isolated storage outage")
	}
	delete(s.objects, key)
	return nil
}
func (s *cleanupStore) ListPrefix(_ context.Context, prefix string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var keys []string
	for k := range s.objects {
		if strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	return keys, nil
}
func (s *cleanupStore) count() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.objects) }

func cleanupFixture(t *testing.T) (*gorm.DB, *Service, *auth.Service, *cleanupStore, auth.LoginResult) {
	t.Helper()
	db, err := platform.OpenDB("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	t.Cleanup(func() { _ = conn.Close() })
	if err := db.AutoMigrate(append(auth.Models(), Models()...)...); err != nil {
		t.Fatal(err)
	}
	store := &cleanupStore{objects: map[string][]byte{}}
	photos := NewService(db, store)
	accounts := auth.NewService(db, "test-only-cleanup-secret-0123456789", map[auth.Provider]auth.Verifier{auth.Kakao: cleanupVerifier{}}, nil)
	accounts.BeforeDelete = []func(string) error{func(uid string) error { return photos.DeleteAll(context.Background(), uid) }}
	login, err := accounts.Login(context.Background(), auth.Kakao, "owner")
	if err != nil {
		t.Fatal(err)
	}
	return db, photos, accounts, store, login
}

func TestCleanupRetainsReferencesOnObjectDeleteFailure(t *testing.T) {
	db, photos, _, store, owner := cleanupFixture(t)
	ctx := context.Background()
	date := platform.Date("2026-10-19")
	if err := photos.Put(ctx, owner.UserID, date, 1, []byte("isolated-photo"), "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	store.failDelete = true
	if err := photos.Delete(ctx, owner.UserID, date, 1); err == nil {
		t.Fatal("object deletion failure was swallowed")
	}
	var rows int64
	db.Model(&MealPhoto{}).Count(&rows)
	if rows != 1 || store.count() != 1 {
		t.Fatal("failed deletion lost its retry reference")
	}
	store.failDelete = false
	if err := photos.Delete(ctx, owner.UserID, date, 1); err != nil {
		t.Fatal(err)
	}
	db.Model(&MealPhoto{}).Count(&rows)
	if rows != 0 || store.count() != 0 {
		t.Fatal("retry did not remove bytes and reference")
	}
}

func TestCleanupAccountDeletionRetriesReplacedAndOrphanedPhotos(t *testing.T) {
	db, photos, accounts, store, owner := cleanupFixture(t)
	ctx := context.Background()
	date := platform.Date("2026-10-19")
	if err := photos.Put(ctx, owner.UserID, date, 1, []byte("old"), "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	store.failDelete = true
	if err := photos.Put(ctx, owner.UserID, date, 1, []byte("new"), "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	store.objects["u/"+owner.UserID+"/historical-orphan.jpg"] = []byte("orphan")
	store.objects["u/neighbour/keep.jpg"] = []byte("other-user")
	if err := accounts.DeleteAccount(owner.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := accounts.Resolve(owner.Token); err == nil {
		t.Fatal("deletion-pending account remained accessible")
	}
	var jobs int64
	db.Model(&auth.KakaoDeletionJob{}).Count(&jobs)
	if jobs != 1 || store.count() != 4 {
		t.Fatalf("storage failure lost durable account cleanup: jobs=%d objects=%d", jobs, store.count())
	}
	store.failDelete = false
	if err := accounts.ProcessKakaoDeletions(ctx); err != nil {
		t.Fatal(err)
	}
	db.Model(&auth.KakaoDeletionJob{}).Count(&jobs)
	if jobs != 0 || store.count() != 1 {
		t.Fatal("retry missed an old object or deleted another user's file")
	}
	if _, ok := store.objects["u/neighbour/keep.jpg"]; !ok {
		t.Fatal("foreign ownership prefix deleted")
	}
	var refs, objects int64
	db.Model(&MealPhoto{}).Count(&refs)
	db.Model(&ObjectDeletion{}).Count(&objects)
	if refs != 0 || objects != 0 {
		t.Fatal("cleanup references remain")
	}
}

func TestCleanupInflightUploadCannotSurviveAccountDeletion(t *testing.T) {
	db, photos, accounts, store, owner := cleanupFixture(t)
	ctx := context.Background()
	store.entered = make(chan struct{})
	store.release = make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- photos.Put(ctx, owner.UserID, platform.Date("2026-10-19"), 1, []byte("inflight"), "image/jpeg")
	}()
	<-store.entered
	if err := accounts.DeleteAccount(owner.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := accounts.Resolve(owner.Token); err == nil {
		t.Fatal("account was not immediately blocked")
	}
	close(store.release)
	if err := <-done; err == nil {
		t.Fatal("upload metadata was committed after account blocking")
	}
	// Wait expiry is simulated; no sleep and no production data is used.
	if err := db.Model(&ObjectDeletion{}).Where("user_id = ?", owner.UserID).Update("next_attempt_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	if err := accounts.ProcessKakaoDeletions(ctx); err != nil {
		t.Fatal(err)
	}
	if store.count() != 0 {
		t.Fatal("in-flight bytes survived account deletion")
	}
	var users, objects int64
	db.Model(&platform.User{}).Count(&users)
	db.Model(&ObjectDeletion{}).Count(&objects)
	if users != 0 || objects != 0 {
		t.Fatal("account cleanup was not completed")
	}
}

func TestFileStoreListsOnlyOwnedPrefix(t *testing.T) {
	store := FileStore{Dir: t.TempDir()}
	ctx := context.Background()
	for _, key := range []string{"u/a/one.jpg", "u/a/orphan.jpg", "u/ab/other.jpg"} {
		if err := store.Put(ctx, key, []byte("isolated"), "image/jpeg"); err != nil {
			t.Fatal(err)
		}
	}
	keys, err := store.ListPrefix(ctx, "u/a/")
	if err != nil || len(keys) != 2 {
		t.Fatalf("owned prefix listing count=%d err=%v", len(keys), err)
	}
	if _, err := store.ListPrefix(ctx, "../../"); err == nil {
		t.Fatal("escaped prefix accepted")
	}
}

func TestR2ListsSignedOwnedPrefixWithPagination(t *testing.T) {
	hits := 0
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.URL.Query().Get("prefix") != "u/a/" || r.URL.Query().Get("list-type") != "2" || !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 ") {
			t.Error("unsigned or unscoped listing")
		}
		w.Header().Set("Content-Type", "application/xml")
		if hits == 1 {
			fmt.Fprint(w, `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next+/=</NextContinuationToken><Contents><Key>u/a/one.jpg</Key></Contents></ListBucketResult>`)
		} else {
			if r.URL.Query().Get("continuation-token") != "next+/=" {
				t.Error("pagination token damaged")
			}
			fmt.Fprint(w, `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>u/a/orphan.jpg</Key></Contents></ListBucketResult>`)
		}
	}))
	defer remote.Close()
	store := &R2Store{Endpoint: remote.URL, Bucket: "isolated", AccessKey: "test-only-access", SecretKey: "test-only-secret", Region: "auto"}
	keys, err := store.ListPrefix(context.Background(), "u/a/")
	if err != nil || len(keys) != 2 || hits != 2 {
		t.Fatalf("listing count=%d hits=%d err=%v", len(keys), hits, err)
	}
}

func TestR2RejectsForeignOwnershipInListing(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<ListBucketResult><Contents><Key>u/another-user/private.jpg</Key></Contents></ListBucketResult>`)
	}))
	defer remote.Close()
	store := &R2Store{Endpoint: remote.URL, Bucket: "isolated", AccessKey: "test-only-access", SecretKey: "test-only-secret", Region: "auto"}
	if _, err := store.ListPrefix(context.Background(), "u/owner/"); err == nil {
		t.Fatal("foreign ownership prefix accepted")
	}
}
