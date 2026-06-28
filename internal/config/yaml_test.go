package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHubConfigFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "hub.yaml")
	yaml := `
port: 4000
contactEmail: ${TEST_EMAIL:-fallback@example.com}
requireAuthIgnored: true
trustedProxies: "10.0.0.0/8"
poll:
  min: "120"
  max: "240"
auth:
  origin: https://example.test
  requireAuth: true
provision:
  - id: eu-1
    token: tok-eu
    region: eu-central-1
    provider: steam
  - id: blank
    token: ""
    region: us-east-1
    provider: steam
`
	if err := os.WriteFile(path, []byte(yaml), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("HUB_CONFIG", path)
	t.Setenv("PORT", "5000") // env must win over the file
	// TEST_EMAIL deliberately unset so the ${...:-default} branch is exercised.

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.Port != 5000 {
		t.Errorf("Port = %d, want 5000 (env overrides file)", cfg.Port)
	}
	if cfg.ContactEmail == nil || *cfg.ContactEmail != "fallback@example.com" {
		t.Errorf("ContactEmail = %v, want fallback@example.com", cfg.ContactEmail)
	}
	if cfg.Auth.Origin != "https://example.test" {
		t.Errorf("Origin = %q, want https://example.test", cfg.Auth.Origin)
	}
	if !cfg.Auth.RequireAuthInitial {
		t.Error("RequireAuthInitial = false, want true")
	}
	if len(cfg.TrustProxy.CIDRs) != 1 {
		t.Errorf("TrustProxy.CIDRs = %v, want one entry", cfg.TrustProxy.CIDRs)
	}
	if cfg.GlobalCadence.Min != "120" || cfg.GlobalCadence.Max != "240" {
		t.Errorf("cadence = %+v, want min 120 max 240", cfg.GlobalCadence)
	}
	if len(cfg.ProvisionAgents) != 1 || cfg.ProvisionAgents[0].ProvisionID != "eu-1" {
		t.Errorf("ProvisionAgents = %+v, want only eu-1 (blank token skipped)", cfg.ProvisionAgents)
	}
}
