package photo

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// The "GET Object" example of the AWS Signature Version 4 documentation (Authenticating Requests: Using the
// Authorization Header > Examples), with its published signature.
func TestSignV4MatchesAWSExample(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "https://examplebucket.s3.amazonaws.com/test.txt", nil)
	req.Header.Set("Range", "bytes=0-9")
	now := time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC)
	signV4(req, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		"AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1", now)
	want := "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
		"SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
		"Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
	if got := req.Header.Get("Authorization"); got != want {
		t.Fatalf("authorization\n got %s\nwant %s", got, want)
	}
}

func TestFileStoreRoundTripAndRefusesEscapingKeys(t *testing.T) {
	ctx := context.Background()
	s := FileStore{Dir: t.TempDir()}
	if err := s.Put(ctx, "u/a/x.jpg", []byte("jpeg"), "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	if b, err := s.Get(ctx, "u/a/x.jpg"); err != nil || string(b) != "jpeg" {
		t.Fatalf("get: %q %v", b, err)
	}
	if err := s.Delete(ctx, "u/a/x.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, "u/a/x.jpg"); err != ErrNotFound {
		t.Fatalf("after delete: %v", err)
	}
	if err := s.Delete(ctx, "u/a/x.jpg"); err != nil {
		t.Fatalf("deleting twice: %v", err)
	}
	if err := s.Put(ctx, "../../etc/x", []byte("x"), ""); err == nil || !strings.Contains(err.Error(), "bad key") {
		t.Fatalf("escaping key accepted: %v", err)
	}
}
