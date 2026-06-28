package auth

import "github.com/buco7854/bloodpoint-incentives/internal/db"

// PublicUser is a user shape safe to return to clients (no secrets).
type PublicUser struct {
	ID          int64       `json:"id"`
	Username    string      `json:"username"`
	Email       *string     `json:"email"`
	Name        *string     `json:"name"`
	Role        db.UserRole `json:"role"`
	HasPassword bool        `json:"hasPassword"`
	TotpEnabled bool        `json:"totpEnabled"`
	HasPasskey  bool        `json:"hasPasskey"`
	Enabled     bool        `json:"enabled"`
	CreatedAt   int64       `json:"createdAt"`
	LastLoginAt *int64      `json:"lastLoginAt"`
}

// PublicUserOf builds the client-safe view, filling hasPasskey from the repo.
func PublicUserOf(repo *db.AuthRepo, u db.UserRow) PublicUser {
	creds, _ := repo.CredentialsForUser(u.ID)
	return PublicUser{
		ID: u.ID, Username: u.Username, Email: u.Email, Name: u.Name, Role: u.Role,
		HasPassword: u.PasswordHash != nil, TotpEnabled: u.TotpSecret != nil,
		HasPasskey: len(creds) > 0, Enabled: u.Enabled, CreatedAt: u.CreatedAt, LastLoginAt: u.LastLoginAt,
	}
}

// LoginNext describes what a freshly password-authenticated user must do next.
type LoginNext struct {
	Next    string   // "ok" | "mfa" | "enroll_mfa"
	Methods []string // "totp", "webauthn"
}

// DecideLoginNext determines the post-password step for a user.
func DecideLoginNext(repo *db.AuthRepo, user db.UserRow) LoginNext {
	methods := []string{}
	if user.TotpSecret != nil {
		methods = append(methods, "totp")
	}
	if creds, _ := repo.CredentialsForUser(user.ID); len(creds) > 0 {
		methods = append(methods, "webauthn")
	}
	if len(methods) > 0 {
		return LoginNext{Next: "mfa", Methods: methods}
	}
	if RoleRequiresMfa(repo, user.Role) {
		return LoginNext{Next: "enroll_mfa", Methods: []string{}}
	}
	return LoginNext{Next: "ok", Methods: []string{}}
}
