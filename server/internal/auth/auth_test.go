package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

var secret = []byte("test-secret-test-secret-test-secret-0123")

func TestTokenRoundTripAndRefusals(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	tok := issue(secret, "user-1", now, time.Hour)
	if got, err := parse(secret, tok, now.Add(time.Minute)); err != nil || got != "user-1" {
		t.Fatalf("parse = %q, %v", got, err)
	}
	if _, err := parse(secret, tok, now.Add(2*time.Hour)); err == nil {
		t.Fatal("expired token accepted")
	}
	if _, err := parse([]byte("another-secret-another-secret-0123456"), tok, now); err == nil {
		t.Fatal("token signed with another secret accepted")
	}
	// alg=none and tampered payload
	none := b64.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`)) + "." + b64.EncodeToString([]byte(`{"sub":"user-1","exp":9999999999}`)) + "."
	for _, bad := range []string{"", "a.b", "a.b.c", none, tok + "x"} {
		if _, err := parse(secret, bad, now); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

// ---- ID token verifier against a local JWKS ----

func jwksServer(t *testing.T, key *rsa.PrivateKey, kid string, hits *int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*hits++
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "kid": kid, "alg": "RS256", "use": "sig",
			"n": b64.EncodeToString(key.N.Bytes()), "e": b64.EncodeToString([]byte{1, 0, 1}),
		}}})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func idToken(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	h, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": kid, "typ": "JWT"})
	p, _ := json.Marshal(claims)
	in := b64.EncodeToString(h) + "." + b64.EncodeToString(p)
	sum := sha256.Sum256([]byte(in))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return in + "." + b64.EncodeToString(sig)
}

func TestIDTokenVerifier(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	now := time.Unix(1_800_000_000, 0)
	hits := 0
	srv := jwksServer(t, key, "k1", &hits)
	v := &IDTokenVerifier{Issuers: []string{"https://accounts.google.com"}, Audiences: []string{"web-client"}, JWKSURL: srv.URL, Now: func() time.Time { return now }}
	ctx := context.Background()
	ok := map[string]any{"iss": "https://accounts.google.com", "aud": "web-client", "sub": "g-123", "exp": now.Add(time.Hour).Unix()}

	if sub, err := v.Verify(ctx, idToken(t, key, "k1", ok)); err != nil || sub != "g-123" {
		t.Fatalf("valid token: %q, %v", sub, err)
	}
	if _, err := v.Verify(ctx, idToken(t, key, "k1", ok)); err != nil || hits != 1 {
		t.Fatalf("keys should be cached: hits=%d err=%v", hits, err)
	}
	// aud may be an array
	arr := map[string]any{"iss": ok["iss"], "aud": []string{"x", "web-client"}, "sub": "g-123", "exp": ok["exp"]}
	if _, err := v.Verify(ctx, idToken(t, key, "k1", arr)); err != nil {
		t.Fatalf("array aud: %v", err)
	}

	clone := func(k string, val any) map[string]any {
		m := map[string]any{}
		for a, b := range ok {
			m[a] = b
		}
		m[k] = val
		return m
	}
	refused := map[string]string{
		"wrong audience": idToken(t, key, "k1", clone("aud", "someone-elses-app")),
		"wrong issuer":   idToken(t, key, "k1", clone("iss", "https://evil.example")),
		"expired":        idToken(t, key, "k1", clone("exp", now.Add(-time.Minute).Unix())),
		"no subject":     idToken(t, key, "k1", clone("sub", "")),
		"forged key":     idToken(t, other, "k1", ok),
		"garbage":        "not.a.jwt",
	}
	for name, tok := range refused {
		if _, err := v.Verify(ctx, tok); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
	if _, err := (&IDTokenVerifier{JWKSURL: srv.URL}).Verify(ctx, idToken(t, key, "k1", ok)); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("no audiences should be ErrNotConfigured, got %v", err)
	}
}

func TestKakaoVerifier(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer good" {
			http.Error(w, `{"msg":"invalid"}`, http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, `{"id":123456789,"expires_in":7199,"app_id":1234}`)
	}))
	defer srv.Close()
	ctx := context.Background()
	v := &KakaoVerifier{AppID: "1234", URL: srv.URL}
	if sub, err := v.Verify(ctx, "good"); err != nil || sub != "123456789" {
		t.Fatalf("good token: %q, %v", sub, err)
	}
	if _, err := v.Verify(ctx, "bad"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("bad token: %v", err)
	}
	if _, err := (&KakaoVerifier{AppID: "9999", URL: srv.URL}).Verify(ctx, "good"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("token of another app: %v", err)
	}
	if _, err := (&KakaoVerifier{URL: srv.URL}).Verify(ctx, "good"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("unconfigured: %v", err)
	}
}
