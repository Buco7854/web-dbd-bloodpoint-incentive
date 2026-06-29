package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest("GET", "/api/v1/platforms/Windows/incentives", nil)
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)

	want := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
	}
	for h, v := range want {
		if got := rec.Header().Get(h); got != v {
			t.Errorf("%s = %q, want %q", h, got, v)
		}
	}
	// HSTS must NOT be sent when the hub isn't on HTTPS (default test config).
	if got := rec.Header().Get("Strict-Transport-Security"); got != "" {
		t.Errorf("unexpected HSTS over plain HTTP: %q", got)
	}
}

func TestRequestBodyIsSizeLimited(t *testing.T) {
	srv, _ := newTestServer(t)
	// A body well over the cap on an agent route must be rejected, not buffered whole.
	big := strings.NewReader(strings.Repeat("a", maxRequestBytes+1024))
	req := httptest.NewRequest("POST", "/api/v1/agent/readings", big)
	req.Header.Set("Authorization", "Bearer nope")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Fatalf("oversized body should not succeed, got %d", rec.Code)
	}
}
