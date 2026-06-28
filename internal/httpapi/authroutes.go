package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
)

const (
	transientTTL     = 10 * time.Minute
	loginMaxAttempts = 10
	loginWindow      = 15 * time.Minute
)

// throttle returns true when the keyed action has exceeded its window budget.
func (s *Server) throttle(key string) bool {
	n, _ := s.deps.Auth.Throttle.Get(key)
	if n >= loginMaxAttempts {
		return true
	}
	s.deps.Auth.Throttle.Set(key, n+1, loginWindow)
	return false
}

func (s *Server) waUser(u db.UserRow) auth.WAUser {
	creds, _ := s.deps.AuthRepo.CredentialsForUser(u.ID)
	stored := make([]auth.StoredCred, 0, len(creds))
	for _, c := range creds {
		stored = append(stored, auth.StoredCred{CredentialID: c.CredentialID, PublicKey: c.PublicKey, Counter: uint32(c.Counter), Transports: c.Transports})
	}
	name := u.Username
	if u.Name != nil && *u.Name != "" {
		name = *u.Name
	}
	return auth.WAUser{ID: u.ID, Username: u.Username, DisplayName: name, Creds: stored}
}

type mfaState struct {
	Required bool     `json:"required"`
	Enroll   bool     `json:"enroll"`
	Methods  []string `json:"methods"`
}

type sessionBody struct {
	NeedsSetup     bool             `json:"needsSetup"`
	RequireAuth    bool             `json:"requireAuth"`
	EnableAPIKeys  bool             `json:"enableApiKeys"`
	Authenticated  bool             `json:"authenticated"`
	AuthLevel      *string          `json:"authLevel"`
	CSRFToken      *string          `json:"csrfToken"`
	NeedsMfaPolicy bool             `json:"needsMfaPolicy"`
	User           *auth.PublicUser `json:"user"`
	Mfa            *mfaState        `json:"mfa"`
}

func (s *Server) registerAuthRoutes() {
	api, repo := s.API, s.deps.AuthRepo
	withTags := func(op huma.Operation) huma.Operation { op.Tags = []string{"auth"}; return op }

	// GET session (capabilities + current user).
	huma.Register(api, withTags(huma.Operation{OperationID: "get-auth-session", Method: "GET", Path: "/api/v1/auth/session", Summary: "Current auth capabilities and user"}),
		func(ctx context.Context, _ *struct{}) (*struct{ Body sessionBody }, error) {
			out := &struct{ Body sessionBody }{}
			out.Body.NeedsSetup = !repo.AdminExists()
			out.Body.RequireAuth = auth.GetRequireAuth(repo)
			out.Body.EnableAPIKeys = auth.GetEnableAPIKeys(repo)
			p := principalOf(ctx)
			if p == nil || p.via != "session" || p.session == nil {
				return out, nil
			}
			level := string(p.session.AuthLevel)
			out.Body.AuthLevel = &level
			out.Body.CSRFToken = &p.session.CSRFToken
			out.Body.Authenticated = p.session.AuthLevel == db.AuthMFA
			out.Body.NeedsMfaPolicy = p.user.Role == db.RoleAdmin && !auth.IsMfaPolicyChosen(repo)
			pub := auth.PublicUserOf(repo, p.user)
			out.Body.User = &pub
			if p.session.AuthLevel != db.AuthMFA {
				ln := auth.DecideLoginNext(repo, p.user)
				out.Body.Mfa = &mfaState{Required: ln.Next != "ok", Enroll: ln.Next == "enroll_mfa", Methods: ln.Methods}
			}
			return out, nil
		})

	type nextBody struct {
		Next    string   `json:"next"`
		Methods []string `json:"methods"`
	}

	// POST setup (first admin only).
	huma.Register(api, withTags(huma.Operation{OperationID: "auth-setup", Method: "POST", Path: "/api/v1/auth/setup", Summary: "Create the first admin", DefaultStatus: 201}),
		func(ctx context.Context, in *struct {
			Body struct {
				Username string `json:"username"`
				Password string `json:"password"`
				Email    string `json:"email,omitempty"`
				Name     string `json:"name,omitempty"`
			}
		}) (*struct {
			SetCookie http.Cookie `header:"Set-Cookie"`
			Body      nextBody
		}, error) {
			if repo.AdminExists() {
				return nil, huma.Error409Conflict("setup already completed")
			}
			if in.Body.Username == "" {
				return nil, huma.Error400BadRequest("username is required")
			}
			if len(in.Body.Password) < auth.MinPasswordLength {
				return nil, huma.Error400BadRequest(fmt.Sprintf("password must be at least %d characters", auth.MinPasswordLength))
			}
			hash, err := auth.HashPassword(in.Body.Password)
			if err != nil {
				return nil, err
			}
			user, err := repo.CreateUser(db.NewUser{Username: in.Body.Username, Email: optStr(in.Body.Email), Name: optStr(in.Body.Name), PasswordHash: &hash, Role: db.RoleAdmin})
			if err != nil {
				return nil, err
			}
			_ = repo.TouchLogin(user.ID)
			_, cookie, err := s.deps.Auth.IssueSession(user.ID, db.AuthPassword)
			if err != nil {
				return nil, err
			}
			ln := auth.DecideLoginNext(repo, user)
			out := &struct {
				SetCookie http.Cookie `header:"Set-Cookie"`
				Body      nextBody
			}{}
			out.SetCookie = *cookie
			out.Body = nextBody{Next: ln.Next, Methods: ln.Methods}
			return out, nil
		})

	// POST login.
	huma.Register(api, withTags(huma.Operation{OperationID: "auth-login", Method: "POST", Path: "/api/v1/auth/login", Summary: "Log in with username and password"}),
		func(ctx context.Context, in *struct {
			Device http.Cookie `cookie:"bp_device"`
			Body   struct {
				Username string `json:"username"`
				Password string `json:"password"`
			}
		}) (*struct {
			SetCookie http.Cookie `header:"Set-Cookie"`
			Body      nextBody
		}, error) {
			if s.throttle("login|" + in.Body.Username) {
				return nil, huma.Error429TooManyRequests("too many attempts; try again later")
			}
			user, found, _ := repo.GetUserByUsername(in.Body.Username)
			ok := found && user.Enabled && auth.VerifyPassword(in.Body.Password, user.PasswordHash)
			if !ok {
				auth.VerifyPassword(in.Body.Password, s.dummyHash()) // equalize timing
				return nil, huma.Error401Unauthorized("invalid username or password")
			}
			s.deps.Auth.Throttle.Delete("login|" + in.Body.Username)
			ln := auth.DecideLoginNext(repo, user)
			// A remembered device satisfies the MFA step-up (but never enrollment).
			if ln.Next == "mfa" && s.deps.Auth.DeviceTrusted(in.Device.Value, user.ID) {
				ln.Next = "ok"
			}
			level := db.AuthPassword
			if ln.Next == "ok" {
				level = db.AuthMFA
				_ = repo.TouchLogin(user.ID)
			}
			_, cookie, err := s.deps.Auth.IssueSession(user.ID, level)
			if err != nil {
				return nil, err
			}
			out := &struct {
				SetCookie http.Cookie `header:"Set-Cookie"`
				Body      nextBody
			}{}
			out.SetCookie = *cookie
			out.Body = nextBody{Next: ln.Next, Methods: ln.Methods}
			return out, nil
		})

	// POST logout.
	huma.Register(api, withTags(huma.Operation{OperationID: "auth-logout", Method: "POST", Path: "/api/v1/auth/logout", Summary: "Log out", DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}}),
		func(ctx context.Context, _ *struct{}) (*struct {
			SetCookie http.Cookie `header:"Set-Cookie"`
		}, error) {
			p := principalOf(ctx)
			if p != nil && p.session != nil {
				_ = repo.DeleteSession(p.session.ID)
			}
			return &struct {
				SetCookie http.Cookie `header:"Set-Cookie"`
			}{SetCookie: *s.deps.Auth.ClearedCookie()}, nil
		})

	s.registerMfaRoutes()
	s.registerPasskeyRoutes()
	s.registerAPIKeyRoutes()
}

func optStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

// toMap renders any JSON-serializable value as a generic object (for WebAuthn options).
func toMap(v any) map[string]any {
	raw, _ := json.Marshal(v)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	return m
}

var dummyHashCache string

func (s *Server) dummyHash() *string {
	if dummyHashCache == "" {
		h, _ := auth.HashPassword("absent-placeholder-password")
		dummyHashCache = h
	}
	return &dummyHashCache
}
