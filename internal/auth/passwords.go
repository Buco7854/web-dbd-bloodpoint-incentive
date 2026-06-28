// Package auth provides the hub's authentication: passwords, TOTP, WebAuthn
// passkeys, sessions, API keys, and the settings that gate them.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"strconv"
	"strings"

	"golang.org/x/crypto/scrypt"
)

// scrypt cost parameters (interactive-login cost).
const (
	scryptN   = 16384
	scryptR   = 8
	scryptP   = 1
	scryptLen = 64
)

// MinPasswordLength is the minimum acceptable password length.
const MinPasswordLength = 10

// HashPassword hashes a password with salted scrypt as a self-describing
// "scrypt$N$r$p$salt$hash" string so parameters can be raised later.
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	dk, err := scrypt.Key([]byte(password), salt, scryptN, scryptR, scryptP, scryptLen)
	if err != nil {
		return "", err
	}
	return strings.Join([]string{
		"scrypt", strconv.Itoa(scryptN), strconv.Itoa(scryptR), strconv.Itoa(scryptP),
		base64.StdEncoding.EncodeToString(salt), base64.StdEncoding.EncodeToString(dk),
	}, "$"), nil
}

// VerifyPassword verifies a password against a stored "scrypt$..." hash in constant time.
func VerifyPassword(password string, stored *string) bool {
	if stored == nil {
		return false
	}
	parts := strings.Split(*stored, "$")
	if len(parts) != 6 || parts[0] != "scrypt" {
		return false
	}
	n, err1 := strconv.Atoi(parts[1])
	r, err2 := strconv.Atoi(parts[2])
	p, err3 := strconv.Atoi(parts[3])
	salt, err4 := base64.StdEncoding.DecodeString(parts[4])
	dk, err5 := base64.StdEncoding.DecodeString(parts[5])
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil || len(salt) == 0 || len(dk) == 0 {
		return false
	}
	test, err := scrypt.Key([]byte(password), salt, n, r, p, len(dk))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(test, dk) == 1
}
