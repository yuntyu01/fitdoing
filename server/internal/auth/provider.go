package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Provider is a sign-in service the phone logs in with.
type Provider string

const (
	Kakao  Provider = "kakao"
	Google Provider = "google"
	Apple  Provider = "apple"
)

// Verifier checks the token the phone got from a provider SDK and returns the account's stable id at that provider.
type Verifier interface {
	Verify(ctx context.Context, token string) (subject string, err error)
}

// ErrNotConfigured means the server has no keys for that provider.
var ErrNotConfigured = errors.New("provider not configured")
var ErrUnknownKeyID = errors.New("unknown key id")

// ---- Google / Apple: OpenID Connect ID tokens (RS256, public keys from the provider's JWKS) ----

const (
	GoogleJWKS = "https://www.googleapis.com/oauth2/v3/certs"
	AppleJWKS  = "https://appleid.apple.com/auth/keys"
)

type IDTokenVerifier struct {
	Issuers   []string
	Audiences []string
	JWKSURL   string
	Client    *http.Client
	Now       func() time.Time

	mu      sync.Mutex
	keys    map[string]*rsa.PublicKey
	fetched time.Time
}

func (v *IDTokenVerifier) Configured() bool { return len(v.Audiences) > 0 }

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (v *IDTokenVerifier) now() time.Time {
	if v.Now != nil {
		return v.Now()
	}
	return time.Now()
}

func (v *IDTokenVerifier) client() *http.Client {
	if v.Client != nil {
		return v.Client
	}
	return &http.Client{Timeout: 10 * time.Second}
}

// key returns the public key for kid; it refetches the JWKS when the cache is old or the kid is unknown
// (providers rotate keys), but at most once a minute.
func (v *IDTokenVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	age := v.now().Sub(v.fetched)
	if k, ok := v.keys[kid]; ok && age < time.Hour {
		return k, nil
	}
	if v.keys == nil || age >= time.Minute {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.JWKSURL, nil)
		if err != nil {
			return nil, err
		}
		res, err := v.client().Do(req)
		if err != nil {
			return nil, err
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("jwks: status %d", res.StatusCode)
		}
		var set struct {
			Keys []jwk `json:"keys"`
		}
		if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&set); err != nil {
			return nil, err
		}
		keys := map[string]*rsa.PublicKey{}
		for _, k := range set.Keys {
			if k.Kty != "RSA" {
				continue
			}
			n, err1 := b64.DecodeString(k.N)
			e, err2 := b64.DecodeString(k.E)
			if err1 != nil || err2 != nil {
				continue
			}
			keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
		}
		v.keys, v.fetched = keys, v.now()
	}
	if k, ok := v.keys[kid]; ok {
		return k, nil
	}
	return nil, ErrUnknownKeyID
}

func (v *IDTokenVerifier) Verify(ctx context.Context, token string) (string, error) {
	if len(v.Audiences) == 0 {
		return "", ErrNotConfigured
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", ErrInvalidToken
	}
	var hdr struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	hb, err := b64.DecodeString(parts[0])
	if err != nil || json.Unmarshal(hb, &hdr) != nil || hdr.Alg != "RS256" {
		return "", ErrInvalidToken
	}
	pub, err := v.key(ctx, hdr.Kid)
	if err != nil {
		return "", err
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil {
		return "", ErrInvalidToken
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(pub, crypto.SHA256, sum[:], sig) != nil {
		return "", ErrInvalidToken
	}
	pb, err := b64.DecodeString(parts[1])
	if err != nil {
		return "", ErrInvalidToken
	}
	var c struct {
		Iss string          `json:"iss"`
		Aud json.RawMessage `json:"aud"` // string or array
		Sub string          `json:"sub"`
		Exp int64           `json:"exp"`
	}
	if json.Unmarshal(pb, &c) != nil || c.Sub == "" {
		return "", ErrInvalidToken
	}
	if !slices.Contains(v.Issuers, c.Iss) || v.now().Unix() >= c.Exp {
		return "", ErrInvalidToken
	}
	var auds []string
	if json.Unmarshal(c.Aud, &auds) != nil {
		var one string
		if json.Unmarshal(c.Aud, &one) != nil {
			return "", ErrInvalidToken
		}
		auds = []string{one}
	}
	if !slices.ContainsFunc(auds, func(a string) bool { return slices.Contains(v.Audiences, a) }) {
		return "", fmt.Errorf("%w: token is for another app", ErrInvalidToken)
	}
	return c.Sub, nil
}

func NewGoogle(clientIDs []string) *IDTokenVerifier {
	return &IDTokenVerifier{Issuers: []string{"https://accounts.google.com", "accounts.google.com"}, Audiences: clientIDs, JWKSURL: GoogleJWKS}
}

func NewApple(clientID string) *IDTokenVerifier {
	var auds []string
	if clientID != "" {
		auds = []string{clientID}
	}
	return &IDTokenVerifier{Issuers: []string{"https://appleid.apple.com"}, Audiences: auds, JWKSURL: AppleJWKS}
}

// ---- Kakao: access token, checked against Kakao's token-info API ----

const KakaoTokenInfoURL = "https://kapi.kakao.com/v1/user/access_token_info"

type KakaoVerifier struct {
	AppID  string
	URL    string
	Client *http.Client
}

func (v *KakaoVerifier) Configured() bool { return v.AppID != "" }

func (v *KakaoVerifier) Verify(ctx context.Context, token string) (string, error) {
	if v.AppID == "" {
		return "", ErrNotConfigured
	}
	url := v.URL
	if url == "" {
		url = KakaoTokenInfoURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	c := v.Client
	if c == nil {
		c = &http.Client{Timeout: 10 * time.Second}
	}
	res, err := c.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", ErrInvalidToken
	}
	var info struct {
		ID    int64 `json:"id"`
		AppID int64 `json:"app_id"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(&info); err != nil || info.ID == 0 {
		return "", ErrInvalidToken
	}
	if strconv.FormatInt(info.AppID, 10) != v.AppID { // a token Kakao issued for some other app
		return "", fmt.Errorf("%w: token is for another app", ErrInvalidToken)
	}
	return strconv.FormatInt(info.ID, 10), nil
}
