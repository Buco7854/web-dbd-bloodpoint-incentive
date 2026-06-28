package auth

import (
	"encoding/json"
	"testing"
)

func newTestWA(t *testing.T) *WebAuthn {
	t.Helper()
	w, err := NewWebAuthn("example.com", "Example", "https://example.com")
	if err != nil {
		t.Fatalf("NewWebAuthn: %v", err)
	}
	return w
}

func testUser() WAUser {
	return WAUser{
		ID:          42,
		Username:    "alice",
		DisplayName: "Alice",
	}
}

func TestBeginRegistration(t *testing.T) {
	w := newTestWA(t)
	opts, session, err := w.BeginRegistration(testUser())
	if err != nil {
		t.Fatalf("BeginRegistration: %v", err)
	}
	if opts == nil {
		t.Fatal("expected non-nil options")
	}
	if session == "" {
		t.Fatal("expected non-empty session blob")
	}

	// options must be JSON-serializable and contain a publicKey challenge.
	b, err := json.Marshal(opts)
	if err != nil {
		t.Fatalf("marshal options: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal options: %v", err)
	}
	pk, ok := m["publicKey"].(map[string]any)
	if !ok {
		t.Fatalf("expected publicKey object in options, got %v", m)
	}
	if pk["challenge"] == nil {
		t.Fatal("expected challenge in publicKey options")
	}

	// session blob must round-trip as JSON.
	var sess map[string]any
	if err := json.Unmarshal([]byte(session), &sess); err != nil {
		t.Fatalf("session blob is not valid JSON: %v", err)
	}
}

func TestBeginLogin(t *testing.T) {
	w := newTestWA(t)
	u := testUser()
	u.Creds = []StoredCred{{
		// 16 random-ish bytes base64url (no padding).
		CredentialID: "AQIDBAUGBwgJCgsMDQ4PEA",
		PublicKey:    "AQIDBAUGBwgJCgsMDQ4PEA",
		Counter:      0,
		Transports:   []string{"internal"},
	}}
	opts, session, err := w.BeginLogin(u)
	if err != nil {
		t.Fatalf("BeginLogin: %v", err)
	}
	if opts == nil {
		t.Fatal("expected non-nil options")
	}
	if session == "" {
		t.Fatal("expected non-empty session blob")
	}
}

func TestCredentialRoundTrip(t *testing.T) {
	in := StoredCred{
		CredentialID: "AQIDBAUGBwgJCgsMDQ4PEA",
		PublicKey:    "AQIDBAUGBwgJCgsMDQ4PEA",
		Counter:      7,
		Transports:   []string{"usb", "nfc"},
	}
	wc, err := toCredential(in)
	if err != nil {
		t.Fatalf("toCredential: %v", err)
	}
	out := fromCredential(&wc)
	if out.CredentialID != in.CredentialID {
		t.Errorf("CredentialID = %q, want %q", out.CredentialID, in.CredentialID)
	}
	if out.PublicKey != in.PublicKey {
		t.Errorf("PublicKey = %q, want %q", out.PublicKey, in.PublicKey)
	}
	if out.Counter != in.Counter {
		t.Errorf("Counter = %d, want %d", out.Counter, in.Counter)
	}
	if len(out.Transports) != len(in.Transports) {
		t.Errorf("Transports = %v, want %v", out.Transports, in.Transports)
	}
}
