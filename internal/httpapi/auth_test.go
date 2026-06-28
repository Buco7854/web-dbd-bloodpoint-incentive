package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/config"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/orchestrator"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
	"github.com/buco7854/bloodpoint-incentives/internal/store"
)

func newAuthServer(t *testing.T, requireAuth, enableKeys bool) *Server {
	t.Helper()
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	readings, _ := db.NewReadingsRepo(conn)
	agents, _ := db.NewAgentsRepo(conn)
	agents.Create(db.NewAgent{TokenHash: "h", Region: "eu-central-1", Provider: "steam", Platform: domain.PlatformWindows, Source: db.SourceManual})
	authRepo, _ := db.NewAuthRepo(conn)
	auth.SeedSettings(authRepo, requireAuth, enableKeys)
	prov, _ := registry.NewProvider(agents.ListEnabled)
	st := store.New(prov.Current, store.Meta{PageSize: 20, StaleAfterSeconds: 900, AgentSetupURL: "x"}, readings, nil, nil)
	authService := auth.NewAuthService(authRepo, auth.Config{SessionSecret: "secret", SessionTTLMs: 3600_000, RPID: "localhost", RPName: "Test", Origin: "http://localhost"}, nil)
	return New(Deps{
		Config: &config.Config{DataRetentionDays: 31, ForecastWindowDays: 84},
		Store:  st, Orchestrator: orchestrator.New(prov.Current, domain.CadenceSpec{Min: "300", Max: "400"}, 300),
		Registry: prov, Readings: readings, Agents: agents, Auth: authService, AuthRepo: authRepo,
	})
}

func do(srv *Server, method, path string, body string, headers map[string]string) *httptest.ResponseRecorder {
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("content-type", "application/json")
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, r)
	return rec
}

func TestAuthGateAndAPIKeys(t *testing.T) {
	srv := newAuthServer(t, true, true)

	// Anonymous read is gated.
	if rec := do(srv, "GET", "/api/v1/platforms/Windows/incentives", "", nil); rec.Code != 401 {
		t.Fatalf("anon read = %d, want 401", rec.Code)
	}

	// Setup the first admin; capture the session cookie.
	rec := do(srv, "POST", "/api/v1/auth/setup", `{"username":"admin","password":"supersecret1"}`, nil)
	if rec.Code != 201 {
		t.Fatalf("setup = %d", rec.Code)
	}
	cookie := rec.Header().Get("Set-Cookie")
	if cookie == "" {
		t.Fatal("setup did not set a cookie")
	}
	cookieHdr := strings.SplitN(cookie, ";", 2)[0]
	auth := map[string]string{"Cookie": cookieHdr}

	// Read the CSRF token.
	var sess struct {
		CSRFToken string `json:"csrfToken"`
	}
	rec = do(srv, "GET", "/api/v1/auth/session", "", auth)
	json.Unmarshal(rec.Body.Bytes(), &sess)
	if sess.CSRFToken == "" {
		t.Fatal("no csrf token after setup")
	}
	withCSRF := map[string]string{"Cookie": cookieHdr, "x-csrf-token": sess.CSRFToken}

	// Drop the MFA requirement so this admin session reaches mfa level.
	if rec := do(srv, "POST", "/api/v1/auth/mfa/policy", `{"roles":[]}`, withCSRF); rec.Code != 204 {
		t.Fatalf("policy = %d: %s", rec.Code, rec.Body)
	}

	// Creating a key without the CSRF header is rejected (session is now mfa-level).
	if rec := do(srv, "POST", "/api/v1/auth/api-keys", `{"label":"x"}`, auth); rec.Code != 403 {
		t.Fatalf("no-csrf create = %d, want 403", rec.Code)
	}

	// Create an API key.
	rec = do(srv, "POST", "/api/v1/auth/api-keys", `{"label":"ci"}`, withCSRF)
	if rec.Code != 201 {
		t.Fatalf("create key = %d: %s", rec.Code, rec.Body)
	}
	var created struct {
		Key string `json:"key"`
	}
	json.Unmarshal(rec.Body.Bytes(), &created)
	if !strings.HasPrefix(created.Key, "bpi_") {
		t.Fatalf("unexpected key: %q", created.Key)
	}

	// The key authenticates a read.
	if rec := do(srv, "GET", "/api/v1/platforms/Windows/incentives", "", map[string]string{"Authorization": "Bearer " + created.Key}); rec.Code != 200 {
		t.Fatalf("bearer read = %d, want 200", rec.Code)
	}
	// A bogus bearer does not.
	if rec := do(srv, "GET", "/api/v1/platforms/Windows/incentives", "", map[string]string{"Authorization": "Bearer bpi_nope"}); rec.Code != 401 {
		t.Fatalf("bogus bearer read = %d, want 401", rec.Code)
	}
}

func TestKeysDisabledRejectsBearer(t *testing.T) {
	srv := newAuthServer(t, true, false) // REQUIRE_AUTH on, API keys OFF
	if rec := do(srv, "GET", "/api/v1/platforms/Windows/incentives", "", map[string]string{"Authorization": "Bearer bpi_anything"}); rec.Code != 401 {
		t.Fatalf("bearer with keys disabled = %d, want 401", rec.Code)
	}
}
