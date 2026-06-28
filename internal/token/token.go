// Package token mints and hashes bearer credentials (agent tokens, API keys).
// Only the SHA-256 hash is ever stored, so the database never holds a usable secret.
package token

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

// Generate returns a fresh URL-safe 64-byte token, shown to the operator once.
func Generate() string {
	b := make([]byte, 64)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand failing is unrecoverable
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// Hash returns the SHA-256 hex of a token, for storage and lookup.
func Hash(tok string) string {
	sum := sha256.Sum256([]byte(tok))
	return hex.EncodeToString(sum[:])
}
