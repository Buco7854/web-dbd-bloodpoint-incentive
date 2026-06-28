package auth

import (
	"log/slog"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
)

// BootstrapAdmin is an admin seeded from env on first boot.
type BootstrapAdmin struct {
	Username string
	Password string
	Email    *string
	Name     *string
}

// SeedBootstrapAdmin creates the env-seeded admin if that username doesn't exist yet.
func SeedBootstrapAdmin(repo *db.AuthRepo, b BootstrapAdmin, log *slog.Logger) error {
	if _, found, err := repo.GetUserByUsername(b.Username); err != nil || found {
		return err
	}
	hash, err := HashPassword(b.Password)
	if err != nil {
		return err
	}
	if _, err := repo.CreateUser(db.NewUser{
		Username: b.Username, Email: b.Email, Name: b.Name, PasswordHash: &hash, Role: db.RoleAdmin,
	}); err != nil {
		return err
	}
	if log != nil {
		log.Info("seeded bootstrap admin from env", "username", b.Username)
	}
	return nil
}
