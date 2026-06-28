package auth

import (
	"encoding/json"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
)

const (
	keyMfaRoles        = "mfa_enforced_roles"
	keyMfaPolicyChosen = "mfa_policy_chosen"
	keyRequireAuth     = "require_auth"
	keyEnableAPIKeys   = "enable_api_keys"
)

// MfaEnforcedRoles returns the roles for which a second factor is mandatory (default: admin).
func MfaEnforcedRoles(repo *db.AuthRepo) []db.UserRole {
	raw, ok := repo.GetSetting(keyMfaRoles)
	if !ok {
		return []db.UserRole{db.RoleAdmin}
	}
	var parsed []string
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return []db.UserRole{db.RoleAdmin}
	}
	out := []db.UserRole{}
	for _, r := range parsed {
		if db.IsUserRole(r) {
			out = append(out, db.UserRole(r))
		}
	}
	return out
}

// SetMfaEnforcedRoles stores the policy and marks it explicitly chosen.
func SetMfaEnforcedRoles(repo *db.AuthRepo, roles []db.UserRole) error {
	seen := map[db.UserRole]bool{}
	unique := []db.UserRole{}
	for _, r := range roles {
		if db.IsUserRole(string(r)) && !seen[r] {
			seen[r] = true
			unique = append(unique, r)
		}
	}
	b, _ := json.Marshal(unique)
	if err := repo.SetSetting(keyMfaRoles, string(b)); err != nil {
		return err
	}
	return repo.SetSetting(keyMfaPolicyChosen, "true")
}

// IsMfaPolicyChosen reports whether an admin has explicitly chosen the MFA policy.
func IsMfaPolicyChosen(repo *db.AuthRepo) bool {
	v, _ := repo.GetSetting(keyMfaPolicyChosen)
	return v == "true"
}

// RoleRequiresMfa reports whether a role must have a second factor.
func RoleRequiresMfa(repo *db.AuthRepo, role db.UserRole) bool {
	for _, r := range MfaEnforcedRoles(repo) {
		if r == role {
			return true
		}
	}
	return false
}

// GetRequireAuth reports whether the public map/API requires a session.
func GetRequireAuth(repo *db.AuthRepo) bool {
	v, _ := repo.GetSetting(keyRequireAuth)
	return v == "true"
}

func SetRequireAuth(repo *db.AuthRepo, on bool) error {
	return repo.SetSetting(keyRequireAuth, boolStr(on))
}

// GetEnableAPIKeys reports whether API-key authentication is enabled.
func GetEnableAPIKeys(repo *db.AuthRepo) bool {
	v, _ := repo.GetSetting(keyEnableAPIKeys)
	return v == "true"
}

func SetEnableAPIKeys(repo *db.AuthRepo, on bool) error {
	return repo.SetSetting(keyEnableAPIKeys, boolStr(on))
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// SeedSettings seeds settings on first boot only (env provides initial values).
func SeedSettings(repo *db.AuthRepo, requireAuthInitial, enableAPIKeysInitial bool) error {
	if _, ok := repo.GetSetting(keyMfaRoles); !ok {
		if err := repo.SetSetting(keyMfaRoles, `["admin"]`); err != nil {
			return err
		}
	}
	if _, ok := repo.GetSetting(keyRequireAuth); !ok {
		if err := SetRequireAuth(repo, requireAuthInitial); err != nil {
			return err
		}
	}
	if _, ok := repo.GetSetting(keyEnableAPIKeys); !ok {
		if err := SetEnableAPIKeys(repo, enableAPIKeysInitial); err != nil {
			return err
		}
	}
	return nil
}
