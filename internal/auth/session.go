package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/cache"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

const (
	SessionCookie = "bp_session"
	CSRFHeader    = "x-csrf-token"
)

// Config configures the AuthService.
type Config struct {
	SessionSecret string
	SessionTTLMs  int64
	CookieSecure  bool
	RPID          string
	RPName        string
	Origin        string
}

// AuthService owns session lifecycle, the signed cookie, and transient auth caches.
type AuthService struct {
	Repo     *db.AuthRepo
	WebAuthn *WebAuthn
	RPID     string
	RPName   string
	Origin   string

	secret       []byte
	ttlMs        int64
	cookieSecure bool

	Challenges  cache.Cache[string] // webauthn challenge session blobs, keyed by purpose+session
	PendingTotp cache.Cache[string] // pending TOTP secret during enrollment, keyed by session
	Throttle    cache.Cache[int]    // sliding-window brute-force counter
	apiTouched  cache.Cache[bool]   // throttles last_used_at writes per API key
}

// NewAuthService builds the auth service. webAuthn may be nil if passkeys are unconfigured.
func NewAuthService(repo *db.AuthRepo, cfg Config, webAuthn *WebAuthn) *AuthService {
	return &AuthService{
		Repo: repo, WebAuthn: webAuthn,
		RPID: cfg.RPID, RPName: cfg.RPName, Origin: cfg.Origin,
		secret: []byte(cfg.SessionSecret), ttlMs: cfg.SessionTTLMs, cookieSecure: cfg.CookieSecure,
		Challenges:  cache.NewMemory[string](),
		PendingTotp: cache.NewMemory[string](),
		Throttle:    cache.NewMemory[int](),
		apiTouched:  cache.NewMemory[bool](),
	}
}

func (a *AuthService) sign(id string) string {
	mac := hmac.New(sha256.New, a.secret)
	mac.Write([]byte(id))
	return id + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (a *AuthService) unsign(raw string) (string, bool) {
	dot := strings.LastIndexByte(raw, '.')
	if dot < 0 {
		return "", false
	}
	id, sig := raw[:dot], raw[dot+1:]
	want, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return "", false
	}
	mac := hmac.New(sha256.New, a.secret)
	mac.Write([]byte(id))
	if subtle.ConstantTimeCompare(want, mac.Sum(nil)) != 1 {
		return "", false
	}
	return id, true
}

func (a *AuthService) cookie(value string, maxAgeSeconds int) *http.Cookie {
	c := &http.Cookie{
		Name: SessionCookie, Value: value, Path: "/",
		HttpOnly: true, Secure: a.cookieSecure, SameSite: http.SameSiteLaxMode,
		MaxAge: maxAgeSeconds,
	}
	return c
}

// IssueSession creates a session and returns it with the cookie to set.
func (a *AuthService) IssueSession(userID int64, level db.AuthLevel) (db.SessionRow, *http.Cookie, error) {
	id := token.Generate()
	csrf := token.Generate()
	session, err := a.Repo.CreateSession(db.NewSession{ID: id, UserID: userID, AuthLevel: level, CSRF: csrf, TTLMs: a.ttlMs})
	if err != nil {
		return db.SessionRow{}, nil, err
	}
	return session, a.cookie(a.sign(id), int(a.ttlMs/1000)), nil
}

// ClearedCookie returns a cookie that expires the session cookie.
func (a *AuthService) ClearedCookie() *http.Cookie {
	return a.cookie("", -1)
}

// UpgradeToMfa marks a session fully authenticated.
func (a *AuthService) UpgradeToMfa(sessionID string) error {
	return a.Repo.UpgradeSession(sessionID, db.AuthMFA)
}

// ResolveSessionCookie validates a raw cookie value and returns the live session+user.
// ok is false (and clear=true) when the cookie is invalid/expired and should be cleared.
func (a *AuthService) ResolveSessionCookie(raw string) (sess db.SessionRow, user db.UserRow, ok, clear bool) {
	id, valid := a.unsign(raw)
	if !valid {
		return db.SessionRow{}, db.UserRow{}, false, false
	}
	session, found, err := a.Repo.GetSession(id)
	if err != nil || !found {
		return db.SessionRow{}, db.UserRow{}, false, true
	}
	if session.ExpiresAt <= time.Now().UnixMilli() {
		_ = a.Repo.DeleteSession(session.ID)
		return db.SessionRow{}, db.UserRow{}, false, true
	}
	u, found, err := a.Repo.GetUserByID(session.UserID)
	if err != nil || !found || !u.Enabled {
		_ = a.Repo.DeleteSession(session.ID)
		return db.SessionRow{}, db.UserRow{}, false, true
	}
	_ = a.Repo.TouchSession(session.ID)
	return session, u, true, false
}
