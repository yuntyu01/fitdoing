// Package photo backs up meal photos for users who turned on photo backup in settings. Off by default: without it,
// a photo only passes through the server for analysis and is never stored (package ai).
package photo

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// ErrNotFound: no object under the key.
var ErrNotFound = errors.New("photo: not found")

// Store keeps photo bytes by key ("u/<user>/<date>_<index>_<nanos>.jpg").
type Store interface {
	Put(ctx context.Context, key string, data []byte, contentType string) error
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error // deleting a missing key is not an error
}

// FileStore writes under a local directory (development, single-server deploys with a volume).
type FileStore struct{ Dir string }

func (f FileStore) path(key string) (string, error) {
	p := filepath.Join(f.Dir, filepath.FromSlash(key))
	if !strings.HasPrefix(p, filepath.Clean(f.Dir)+string(filepath.Separator)) {
		return "", fmt.Errorf("photo: bad key %q", key)
	}
	return p, nil
}

func (f FileStore) Put(_ context.Context, key string, data []byte, _ string) error {
	p, err := f.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o600)
}

func (f FileStore) Get(_ context.Context, key string) ([]byte, error) {
	p, err := f.path(key)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return b, err
}

func (f FileStore) Delete(_ context.Context, key string) error {
	p, err := f.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// R2Store talks to Cloudflare R2 through its S3-compatible API (path-style URLs, AWS Signature V4, region "auto").
// No SDK: the three object calls need only a signed PUT/GET/DELETE.
type R2Store struct {
	Endpoint  string // https://<account id>.r2.cloudflarestorage.com
	Bucket    string
	AccessKey string
	SecretKey string
	Region    string // "auto" for R2
	HTTP      *http.Client
	now       func() time.Time
}

func (s *R2Store) client() *http.Client {
	if s.HTTP != nil {
		return s.HTTP
	}
	return http.DefaultClient
}

func (s *R2Store) do(ctx context.Context, method, key string, body []byte, contentType string) (*http.Response, error) {
	u, err := url.Parse(strings.TrimRight(s.Endpoint, "/") + "/" + s.Bucket + "/" + key)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	now := time.Now
	if s.now != nil {
		now = s.now
	}
	sum := sha256.Sum256(body)
	signV4(req, hex.EncodeToString(sum[:]), s.AccessKey, s.SecretKey, s.Region, now().UTC())
	return s.client().Do(req)
}

func (s *R2Store) Put(ctx context.Context, key string, data []byte, contentType string) error {
	res, err := s.do(ctx, http.MethodPut, key, data, contentType)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("r2 put: status %d: %s", res.StatusCode, b)
	}
	return nil
}

func (s *R2Store) Get(ctx context.Context, key string) ([]byte, error) {
	res, err := s.do(ctx, http.MethodGet, key, nil, "")
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if res.StatusCode/100 != 2 {
		return nil, fmt.Errorf("r2 get: status %d", res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, maxPhoto+1))
}

func (s *R2Store) Delete(ctx context.Context, key string) error {
	res, err := s.do(ctx, http.MethodDelete, key, nil, "")
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 && res.StatusCode != http.StatusNotFound {
		return fmt.Errorf("r2 delete: status %d", res.StatusCode)
	}
	return nil
}

func hmacSHA256(key []byte, s string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(s))
	return m.Sum(nil)
}

// signV4 adds x-amz-date, x-amz-content-sha256 and Authorization (AWS Signature Version 4, service s3). It signs host,
// the x-amz-* headers and, when present, content-type and range.
func signV4(req *http.Request, payloadHash, accessKey, secretKey, region string, now time.Time) {
	amzDate := now.Format("20060102T150405Z")
	day := now.Format("20060102")
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)

	headers := map[string]string{"host": req.URL.Host}
	for k, v := range req.Header {
		lk := strings.ToLower(k)
		if strings.HasPrefix(lk, "x-amz-") || lk == "content-type" || lk == "range" {
			headers[lk] = strings.TrimSpace(strings.Join(v, ","))
		}
	}
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	var canonHeaders strings.Builder
	for _, k := range names {
		canonHeaders.WriteString(k + ":" + headers[k] + "\n")
	}
	signed := strings.Join(names, ";")

	path := req.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	canonical := strings.Join([]string{req.Method, path, req.URL.Query().Encode(), canonHeaders.String(), signed, payloadHash}, "\n")
	scope := day + "/" + region + "/s3/aws4_request"
	sum := sha256.Sum256([]byte(canonical))
	toSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hex.EncodeToString(sum[:])
	k := hmacSHA256([]byte("AWS4"+secretKey), day)
	k = hmacSHA256(k, region)
	k = hmacSHA256(k, "s3")
	k = hmacSHA256(k, "aws4_request")
	sig := hex.EncodeToString(hmacSHA256(k, toSign))
	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey, scope, signed, sig))
}
