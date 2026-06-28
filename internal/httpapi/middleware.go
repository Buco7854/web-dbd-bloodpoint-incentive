package httpapi

import (
	"context"
	"net"
	"net/netip"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/config"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
)

type ctxKey int

const (
	principalKey ctxKey = iota
	clientIPKey
)

// readSecurity documents that read endpoints accept a session or API key, and are
// open when REQUIRE_AUTH is off (the empty requirement).
var readSecurity = []map[string][]string{{}, {"session": {}}, {"apiKey": {}}}

// principal is the authenticated identity for a request (nil when anonymous).
type principal struct {
	user    db.UserRow
	session *db.SessionRow
	via     string // "session" | "apikey"
}

func (p *principal) isMfa() bool {
	if p == nil {
		return false
	}
	return p.via == "apikey" || (p.session != nil && p.session.AuthLevel == db.AuthMFA)
}

func principalOf(ctx context.Context) *principal {
	p, _ := ctx.Value(principalKey).(*principal)
	return p
}

// attach resolves a session cookie or API key into a principal on every request.
func (s *Server) attach(ctx huma.Context, next func(huma.Context)) {
	var p *principal
	if c, err := huma.ReadCookie(ctx, auth.SessionCookie); err == nil && c != nil && c.Value != "" {
		if sess, user, ok, _ := s.deps.Auth.ResolveSessionCookie(c.Value); ok {
			sc := sess
			p = &principal{user: user, session: &sc, via: "session"}
		}
	}
	if p == nil && s.apiKeysEnabled() {
		if user, ok := s.deps.Auth.ResolveAPIKey(ctx.Header("Authorization"), ctx.Header("X-API-Key")); ok {
			p = &principal{user: user, via: "apikey"}
		}
	}
	next(huma.WithValue(ctx, principalKey, p))
}

func (s *Server) apiKeysEnabled() bool {
	return s.deps.AuthRepo != nil && auth.GetEnableAPIKeys(s.deps.AuthRepo)
}

// reject writes an error and stops the chain.
func (s *Server) reject(ctx huma.Context, status int, msg string) {
	_ = huma.WriteErr(s.API, ctx, status, msg)
}

// mwSession requires a first-factor (or better) browser session.
func (s *Server) mwSession(ctx huma.Context, next func(huma.Context)) {
	p := principalOf(ctx.Context())
	if p == nil || p.via != "session" {
		s.reject(ctx, 401, "authentication required")
		return
	}
	next(ctx)
}

// mwSessionMfa requires a fully-authenticated browser session (account management).
func (s *Server) mwSessionMfa(ctx huma.Context, next func(huma.Context)) {
	p := principalOf(ctx.Context())
	if p == nil || p.via != "session" || p.session == nil || p.session.AuthLevel != db.AuthMFA {
		s.reject(ctx, 401, "authentication required")
		return
	}
	next(ctx)
}

// mwAdmin requires an admin principal (session-mfa or an admin's API key).
func (s *Server) mwAdmin(ctx huma.Context, next func(huma.Context)) {
	p := principalOf(ctx.Context())
	if p == nil || !p.isMfa() {
		s.reject(ctx, 401, "authentication required")
		return
	}
	if p.user.Role != db.RoleAdmin {
		s.reject(ctx, 403, "admin role required")
		return
	}
	next(ctx)
}

// mwReadGate gates public reads: allow if authenticated, or if REQUIRE_AUTH is off.
func (s *Server) mwReadGate(ctx huma.Context, next func(huma.Context)) {
	p := principalOf(ctx.Context())
	if s.deps.AuthRepo == nil || p.isMfa() || !auth.GetRequireAuth(s.deps.AuthRepo) {
		next(ctx)
		return
	}
	s.reject(ctx, 401, "authentication required")
}

// mwNoBuffer asks reverse proxies (nginx) not to buffer the response, for SSE.
func (s *Server) mwNoBuffer(ctx huma.Context, next func(huma.Context)) {
	ctx.SetHeader("X-Accel-Buffering", "no")
	next(ctx)
}

// mwClientIP resolves the caller's IP and stashes it for the stream handler.
func (s *Server) mwClientIP(ctx huma.Context, next func(huma.Context)) {
	next(huma.WithValue(ctx, clientIPKey, s.clientIP(ctx)))
}

func clientIPOf(ctx context.Context) string {
	ip, _ := ctx.Value(clientIPKey).(string)
	return ip
}

func (s *Server) clientIP(ctx huma.Context) string {
	var t config.ProxyTrust
	if s.deps.Config != nil {
		t = s.deps.Config.TrustProxy
	}
	return resolveClientIP(ctx.RemoteAddr(), ctx.Header("X-Forwarded-For"), t)
}

// resolveClientIP resolves the caller's IP from the proxy chain
// [remoteAddr, XFF right to left], honoring forwarding only as far as the trust
// policy allows. It returns the first hop that is not a trusted proxy (the
// originating client), so a direct, untrusted client can never spoof its IP via
// a forged header.
func resolveClientIP(remoteAddr, xff string, t config.ProxyTrust) string {
	chain := []string{hostOnly(remoteAddr)}
	if xff != "" {
		parts := strings.Split(xff, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			if ip := strings.TrimSpace(parts[i]); ip != "" {
				chain = append(chain, ip)
			}
		}
	}
	for i, ip := range chain {
		if !trustsProxyHop(ip, i, t) {
			return ip
		}
	}
	return chain[len(chain)-1]
}

func hostOnly(remoteAddr string) string {
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}

// trustsProxyHop reports whether the hop at index idx in the proxy chain is a
// trusted proxy under the configured policy (trust all, a hop count, or CIDRs).
func trustsProxyHop(ip string, idx int, t config.ProxyTrust) bool {
	switch {
	case t.All:
		return true
	case t.Hops > 0:
		return idx < t.Hops
	case len(t.CIDRs) > 0:
		addr, err := netip.ParseAddr(ip)
		if err != nil {
			return false
		}
		for _, p := range t.CIDRs {
			if p.Contains(addr) {
				return true
			}
		}
	}
	return false
}

// mwCSRF enforces the double-submit CSRF token for cookie-authenticated, state-changing requests.
func (s *Server) mwCSRF(ctx huma.Context, next func(huma.Context)) {
	switch ctx.Method() {
	case "GET", "HEAD", "OPTIONS":
		next(ctx)
		return
	}
	p := principalOf(ctx.Context())
	if p != nil && p.via == "session" && p.session != nil {
		if ctx.Header(auth.CSRFHeader) != p.session.CSRFToken {
			s.reject(ctx, 403, "invalid csrf token")
			return
		}
	}
	next(ctx)
}
