package auth

import (
	"strings"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

// APIKeyPrefix marks user API keys so their token space is disjoint from agent tokens.
const APIKeyPrefix = "bpi_"

// NewAPIKey mints a raw API key and its display prefix.
func NewAPIKey() (raw, prefix string) {
	raw = APIKeyPrefix + token.Generate()
	if len(raw) >= 12 {
		prefix = raw[:12]
	} else {
		prefix = raw
	}
	return raw, prefix
}

// apiKeyFromHeaders extracts a bpi_-prefixed key from Authorization: Bearer or X-API-Key.
func apiKeyFromHeaders(authorization, xAPIKey string) string {
	if after, ok := strings.CutPrefix(authorization, "Bearer "); ok {
		if k := strings.TrimSpace(after); strings.HasPrefix(k, APIKeyPrefix) {
			return k
		}
	}
	if strings.HasPrefix(xAPIKey, APIKeyPrefix) {
		return xAPIKey
	}
	return ""
}

// ResolveAPIKey authenticates a request's API key to its owner (ok=false if none/invalid).
// The caller must ensure API keys are enabled before calling.
func (a *AuthService) ResolveAPIKey(authorization, xAPIKey string) (db.UserRow, bool) {
	raw := apiKeyFromHeaders(authorization, xAPIKey)
	if raw == "" {
		return db.UserRow{}, false
	}
	row, ok, err := a.Repo.GetAPIKeyByHash(token.Hash(raw), time.Now().UnixMilli())
	if err != nil || !ok {
		return db.UserRow{}, false
	}
	user, found, err := a.Repo.GetUserByID(row.UserID)
	if err != nil || !found || !user.Enabled {
		return db.UserRow{}, false
	}
	// Throttle last_used_at writes to at most once per minute per key.
	if _, recent := a.apiTouched.Get(row.KeyHash); !recent {
		_ = a.Repo.TouchAPIKeyUsed(row.ID)
		a.apiTouched.Set(row.KeyHash, true, time.Minute)
	}
	return user, true
}
