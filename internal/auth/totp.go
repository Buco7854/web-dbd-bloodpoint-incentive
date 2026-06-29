package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/binary"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
	totpStep       = 30
	totpDigits     = 6
)

func base32Encode(buf []byte) string {
	var bits, value uint
	var out strings.Builder
	for _, b := range buf {
		value = value<<8 | uint(b)
		bits += 8
		for bits >= 5 {
			out.WriteByte(base32Alphabet[(value>>(bits-5))&31])
			bits -= 5
		}
	}
	if bits > 0 {
		out.WriteByte(base32Alphabet[(value<<(5-bits))&31])
	}
	return out.String()
}

func base32Decode(s string) []byte {
	clean := strings.ToUpper(s)
	var bits, value uint
	var out []byte
	for _, ch := range clean {
		idx := strings.IndexRune(base32Alphabet, ch)
		if idx < 0 {
			continue
		}
		value = value<<5 | uint(idx)
		bits += 5
		if bits >= 8 {
			out = append(out, byte((value>>(bits-8))&0xff))
			bits -= 8
		}
	}
	return out
}

// GenerateTotpSecret returns a fresh base32 TOTP secret (160 bits).
func GenerateTotpSecret() string {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base32Encode(b)
}

// hotp computes the RFC 4226 HOTP for a base32 secret and counter.
func hotp(secretBase32 string, counter uint64) string {
	key := base32Decode(secretBase32)
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	bin := (uint32(sum[offset]&0x7f) << 24) | (uint32(sum[offset+1]) << 16) | (uint32(sum[offset+2]) << 8) | uint32(sum[offset+3])
	return fmt.Sprintf("%0*d", totpDigits, bin%1_000_000)
}

var sixDigits = regexp.MustCompile(`^\d{6}$`)

// VerifyTotp verifies a 6-digit token against a secret, allowing ±window steps for skew.
func VerifyTotp(secretBase32, token string, at time.Time, window int) bool {
	_, ok := VerifyTotpStep(secretBase32, token, at, window)
	return ok
}

// VerifyTotpStep is like VerifyTotp but also returns the time-step counter the code
// matched, so callers can persist it and reject replays (a code valid within the
// ±window envelope can otherwise be reused for up to ~90s). The caller should reject
// any matched step that is not strictly greater than the last accepted step.
func VerifyTotpStep(secretBase32, token string, at time.Time, window int) (int64, bool) {
	if !sixDigits.MatchString(token) {
		return 0, false
	}
	counter := at.Unix() / totpStep
	for i := -window; i <= window; i++ {
		c := counter + int64(i)
		if c < 0 {
			continue
		}
		candidate := hotp(secretBase32, uint64(c))
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(token)) == 1 {
			return c, true
		}
	}
	return 0, false
}

// TotpAuthURI builds the otpauth:// URI an authenticator app scans.
func TotpAuthURI(secretBase32, account, issuer string) string {
	label := url.QueryEscape(issuer) + ":" + url.QueryEscape(account)
	params := url.Values{}
	params.Set("secret", secretBase32)
	params.Set("issuer", issuer)
	params.Set("algorithm", "SHA1")
	params.Set("digits", fmt.Sprintf("%d", totpDigits))
	params.Set("period", fmt.Sprintf("%d", totpStep))
	return "otpauth://totp/" + label + "?" + params.Encode()
}
