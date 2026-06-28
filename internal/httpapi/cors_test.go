package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func corsHandler(origins []string) http.Handler {
	return corsMiddleware(origins)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
}

func TestCORSAllowsListedOrigin(t *testing.T) {
	h := corsHandler([]string{"https://docs.bpincentives.com"})

	// Preflight from the allowed origin.
	req := httptest.NewRequest("OPTIONS", "/api/v1/platforms/Windows/incentives", nil)
	req.Header.Set("Origin", "https://docs.bpincentives.com")
	req.Header.Set("Access-Control-Request-Method", "GET")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://docs.bpincentives.com" {
		t.Fatalf("ACAO = %q, want the docs origin", got)
	}

	// Actual GET from the allowed origin is reflected.
	req = httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Origin", "https://docs.bpincentives.com")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Fatal("expected ACAO on the actual request")
	}
}

func TestCORSIgnoresUnlistedOrigin(t *testing.T) {
	h := corsHandler([]string{"https://docs.bpincentives.com"})
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("ACAO = %q, want empty for an unlisted origin", got)
	}
}

func TestCORSWildcardNoCredentials(t *testing.T) {
	h := corsHandler([]string{"*"})
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Origin", "https://anything.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("ACAO = %q, want *", got)
	}
	if rec.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatal("wildcard must not set Allow-Credentials")
	}
}
