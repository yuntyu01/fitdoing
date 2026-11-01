package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// HS256 JWTs include the account session version. Resolve checks the live user row so
// deletion blocks access immediately and provider revocation invalidates old sessions.

// ErrInvalidToken marks a token that must be refused (bad signature, expired, other app...).
var ErrInvalidToken = errors.New("invalid token")

var b64 = base64.RawURLEncoding

const tokenHeader = `{"alg":"HS256","typ":"JWT"}`

type claims struct {
	Sub     string `json:"sub"`
	Iat     int64  `json:"iat"`
	Exp     int64  `json:"exp"`
	Version uint64 `json:"ver,omitempty"`
}

func sign(secret []byte, signingInput string) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(signingInput))
	return m.Sum(nil)
}

func issue(secret []byte, userID string, now time.Time, ttl time.Duration, versions ...uint64) string {
	var version uint64
	if len(versions) > 0 {
		version = versions[0]
	}
	body, _ := json.Marshal(claims{Sub: userID, Iat: now.Unix(), Exp: now.Add(ttl).Unix(), Version: version})
	in := b64.EncodeToString([]byte(tokenHeader)) + "." + b64.EncodeToString(body)
	return in + "." + b64.EncodeToString(sign(secret, in))
}

func parse(secret []byte, token string, now time.Time) (string, error) {
	c, err := parseClaims(secret, token, now)
	return c.Sub, err
}

func parseClaims(secret []byte, token string, now time.Time) (claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return claims{}, ErrInvalidToken
	}
	if hdr, err := b64.DecodeString(parts[0]); err != nil || string(hdr) != tokenHeader { // also rejects alg=none
		return claims{}, ErrInvalidToken
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, sign(secret, parts[0]+"."+parts[1])) {
		return claims{}, ErrInvalidToken
	}
	raw, err := b64.DecodeString(parts[1])
	if err != nil {
		return claims{}, ErrInvalidToken
	}
	var c claims
	if json.Unmarshal(raw, &c) != nil || c.Sub == "" || now.Unix() >= c.Exp {
		return claims{}, ErrInvalidToken
	}
	return c, nil
}
