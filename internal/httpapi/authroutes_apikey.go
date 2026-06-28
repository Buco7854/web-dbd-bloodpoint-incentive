package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

type apiKeyEntry struct {
	ID         int64   `json:"id"`
	Prefix     string  `json:"prefix"`
	Label      *string `json:"label"`
	Enabled    bool    `json:"enabled"`
	CreatedAt  int64   `json:"createdAt"`
	LastUsedAt *int64  `json:"lastUsedAt"`
	ExpiresAt  *int64  `json:"expiresAt"`
}

func toAPIKeyEntry(k db.APIKeyRow) apiKeyEntry {
	return apiKeyEntry{ID: k.ID, Prefix: k.Prefix, Label: k.Label, Enabled: k.Enabled, CreatedAt: k.CreatedAt, LastUsedAt: k.LastUsedAt, ExpiresAt: k.ExpiresAt}
}

func (s *Server) registerAPIKeyRoutes() {
	api, repo := s.API, s.deps.AuthRepo
	tags := []string{"auth"}

	huma.Register(api, huma.Operation{OperationID: "auth-apikeys-list", Method: "GET", Path: "/api/v1/auth/api-keys", Summary: "List the user's API keys", Tags: tags, Middlewares: huma.Middlewares{s.mwSessionMfa}},
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				APIKeys []apiKeyEntry `json:"apiKeys"`
			}
		}, error) {
			if !auth.GetEnableAPIKeys(repo) {
				return nil, huma.Error403Forbidden("API keys are disabled on this instance")
			}
			p := principalOf(ctx)
			keys, _ := repo.ListAPIKeysForUser(p.user.ID)
			out := &struct {
				Body struct {
					APIKeys []apiKeyEntry `json:"apiKeys"`
				}
			}{}
			out.Body.APIKeys = []apiKeyEntry{}
			for _, k := range keys {
				out.Body.APIKeys = append(out.Body.APIKeys, toAPIKeyEntry(k))
			}
			return out, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-apikeys-create", Method: "POST", Path: "/api/v1/auth/api-keys", Summary: "Create an API key (shown once)", Tags: tags, DefaultStatus: 201, Middlewares: huma.Middlewares{s.mwSessionMfa, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			Body struct {
				Label     *string `json:"label,omitempty"`
				ExpiresAt *int64  `json:"expiresAt,omitempty" doc:"Expiration time as epoch milliseconds; omit for a key that never expires"`
			}
		}) (*struct {
			Body struct {
				Key    string      `json:"key"`
				APIKey apiKeyEntry `json:"apiKey"`
			}
		}, error) {
			if !auth.GetEnableAPIKeys(repo) {
				return nil, huma.Error403Forbidden("API keys are disabled on this instance")
			}
			var expires *int64
			if in.Body.ExpiresAt != nil && *in.Body.ExpiresAt > 0 {
				if *in.Body.ExpiresAt <= time.Now().UnixMilli() {
					return nil, huma.Error422UnprocessableEntity("expiresAt must be in the future")
				}
				expires = in.Body.ExpiresAt
			}
			p := principalOf(ctx)
			raw, prefix := auth.NewAPIKey()
			row, err := repo.CreateAPIKey(db.NewAPIKey{UserID: p.user.ID, KeyHash: token.Hash(raw), Prefix: prefix, Label: in.Body.Label, ExpiresAt: expires})
			if err != nil {
				return nil, err
			}
			out := &struct {
				Body struct {
					Key    string      `json:"key"`
					APIKey apiKeyEntry `json:"apiKey"`
				}
			}{}
			out.Body.Key = raw
			out.Body.APIKey = toAPIKeyEntry(row)
			return out, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-apikeys-update", Method: "PATCH", Path: "/api/v1/auth/api-keys/{id}", Summary: "Enable or disable an API key", Tags: tags, Middlewares: huma.Middlewares{s.mwSessionMfa, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			ID   int64 `path:"id"`
			Body struct {
				Enabled bool `json:"enabled"`
			}
		}) (*struct {
			Body struct {
				APIKey apiKeyEntry `json:"apiKey"`
			}
		}, error) {
			if !auth.GetEnableAPIKeys(repo) {
				return nil, huma.Error403Forbidden("API keys are disabled on this instance")
			}
			p := principalOf(ctx)
			row, ok, err := repo.SetAPIKeyEnabled(in.ID, p.user.ID, in.Body.Enabled)
			if err != nil {
				return nil, err
			}
			if !ok {
				return nil, huma.Error404NotFound("API key not found")
			}
			out := &struct {
				Body struct {
					APIKey apiKeyEntry `json:"apiKey"`
				}
			}{}
			out.Body.APIKey = toAPIKeyEntry(row)
			return out, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-apikeys-delete", Method: "DELETE", Path: "/api/v1/auth/api-keys/{id}", Summary: "Revoke an API key", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSessionMfa, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			ID int64 `path:"id"`
		}) (*struct{}, error) {
			p := principalOf(ctx)
			if err := repo.DeleteAPIKey(in.ID, p.user.ID); err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-password-change", Method: "POST", Path: "/api/v1/auth/password", Summary: "Change password", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSessionMfa, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			Body struct {
				CurrentPassword string `json:"currentPassword"`
				NewPassword     string `json:"newPassword"`
			}
		}) (*struct{}, error) {
			p := principalOf(ctx)
			if p.user.PasswordHash == nil {
				return nil, huma.Error409Conflict("account has no password")
			}
			if !auth.VerifyPassword(in.Body.CurrentPassword, p.user.PasswordHash) {
				return nil, huma.Error401Unauthorized("current password is incorrect")
			}
			if len(in.Body.NewPassword) < auth.MinPasswordLength {
				return nil, huma.Error400BadRequest("password too short")
			}
			hash, err := auth.HashPassword(in.Body.NewPassword)
			if err != nil {
				return nil, err
			}
			if err := repo.SetPassword(p.user.ID, hash); err != nil {
				return nil, err
			}
			// A password change revokes remembered MFA devices.
			_ = s.deps.Auth.ForgetDevices(p.user.ID)
			return &struct{}{}, nil
		})

	// Revoke all remembered MFA devices and clear this browser's device cookie.
	huma.Register(api, huma.Operation{OperationID: "auth-forget-devices", Method: "DELETE", Path: "/api/v1/auth/trusted-devices", Summary: "Forget all remembered MFA devices", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSessionMfa, s.mwCSRF}},
		func(ctx context.Context, _ *struct{}) (*struct {
			SetCookie http.Cookie `header:"Set-Cookie"`
			Body      struct{}
		}, error) {
			p := principalOf(ctx)
			if err := s.deps.Auth.ForgetDevices(p.user.ID); err != nil {
				return nil, err
			}
			out := &struct {
				SetCookie http.Cookie `header:"Set-Cookie"`
				Body      struct{}
			}{}
			out.SetCookie = *s.deps.Auth.ClearedDeviceCookie()
			return out, nil
		})
}
