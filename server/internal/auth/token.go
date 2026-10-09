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

// Login tokens are plain HS256 JWTs: {"sub": userID, "iat": ..., "exp": ...}. Stateless, so logging out
// just means the phone forgets the token; deleting the account makes every token of it useless
// because the user row is checked on each request (see Service.Resolve).

// ErrInvalidToken marks a token that must be refused (bad signature, expired, other app...).
var ErrInvalidToken = errors.New("invalid token")

var b64 = base64.RawURLEncoding

const tokenHeader = `{"alg":"HS256","typ":"JWT"}`

type claims struct {
	Sub string `json:"sub"`
	Iat int64  `json:"iat"`
	Exp int64  `json:"exp"`
}

func sign(secret []byte, signingInput string) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(signingInput))
	return m.Sum(nil)
}

func issue(secret []byte, userID string, now time.Time, ttl time.Duration) string {
	body, _ := json.Marshal(claims{Sub: userID, Iat: now.Unix(), Exp: now.Add(ttl).Unix()})
	in := b64.EncodeToString([]byte(tokenHeader)) + "." + b64.EncodeToString(body)
	return in + "." + b64.EncodeToString(sign(secret, in))
}

func parse(secret []byte, token string, now time.Time) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", ErrInvalidToken
	}
	if hdr, err := b64.DecodeString(parts[0]); err != nil || string(hdr) != tokenHeader { // also rejects alg=none
		return "", ErrInvalidToken
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, sign(secret, parts[0]+"."+parts[1])) {
		return "", ErrInvalidToken
	}
	raw, err := b64.DecodeString(parts[1])
	if err != nil {
		return "", ErrInvalidToken
	}
	var c claims
	if json.Unmarshal(raw, &c) != nil || c.Sub == "" || now.Unix() >= c.Exp {
		return "", ErrInvalidToken
	}
	return c.Sub, nil
}
