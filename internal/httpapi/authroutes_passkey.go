package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
)

type optionsOutput struct {
	Body map[string]any
}

type passkeyVerifyInput struct {
	Body struct {
		Response json.RawMessage `json:"response"`
		Label    *string         `json:"label,omitempty"`
	}
}

func (s *Server) registerPasskeyRoutes() {
	api, repo := s.API, s.deps.AuthRepo
	tags := []string{"auth"}
	if s.deps.Auth.WebAuthn == nil {
		return // passkeys unconfigured (no origin/rpID)
	}
	wa := s.deps.Auth.WebAuthn

	huma.Register(api, huma.Operation{OperationID: "auth-mfa-passkey-register-options", Method: "POST", Path: "/api/v1/auth/mfa/passkeys/registration", Summary: "Begin passkey registration", Tags: tags, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, _ *struct{}) (*optionsOutput, error) {
			p := principalOf(ctx)
			options, blob, err := wa.BeginRegistration(s.waUser(p.user))
			if err != nil {
				return nil, huma.Error400BadRequest("could not start registration")
			}
			s.deps.Auth.Challenges.Set("reg:"+p.session.ID, blob, transientTTL)
			return &optionsOutput{Body: toMap(options)}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-mfa-passkey-register", Method: "POST", Path: "/api/v1/auth/mfa/passkeys", Summary: "Finish passkey registration", Tags: tags, DefaultStatus: 201, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, in *passkeyVerifyInput) (*struct{}, error) {
			p := principalOf(ctx)
			blob, ok := s.deps.Auth.Challenges.Get("reg:" + p.session.ID)
			if !ok {
				return nil, huma.Error400BadRequest("no pending registration; start again")
			}
			cred, err := wa.FinishRegistration(s.waUser(p.user), blob, in.Body.Response)
			if err != nil {
				s.deps.Log.Warn("passkey registration failed", "err", err)
				return nil, huma.Error400BadRequest("passkey registration failed")
			}
			if err := repo.AddCredential(db.CredentialRow{
				UserID: p.user.ID, CredentialID: cred.CredentialID, PublicKey: cred.PublicKey,
				Counter: int64(cred.Counter), Transports: cred.Transports, Label: in.Body.Label,
			}); err != nil {
				return nil, err
			}
			_ = s.deps.Auth.UpgradeToMfa(p.session.ID)
			_ = repo.TouchLogin(p.user.ID)
			return &struct{}{}, nil
		})

	type passkeyEntry struct {
		ID         int64   `json:"id"`
		Label      *string `json:"label"`
		CreatedAt  int64   `json:"createdAt"`
		LastUsedAt *int64  `json:"lastUsedAt"`
	}
	huma.Register(api, huma.Operation{OperationID: "auth-mfa-passkeys-list", Method: "GET", Path: "/api/v1/auth/mfa/passkeys", Summary: "List the user's passkeys", Tags: tags, Middlewares: huma.Middlewares{s.mwSessionMfa}},
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				Passkeys []passkeyEntry `json:"passkeys"`
			}
		}, error) {
			p := principalOf(ctx)
			creds, _ := repo.CredentialsForUser(p.user.ID)
			out := &struct {
				Body struct {
					Passkeys []passkeyEntry `json:"passkeys"`
				}
			}{}
			out.Body.Passkeys = []passkeyEntry{}
			for _, c := range creds {
				out.Body.Passkeys = append(out.Body.Passkeys, passkeyEntry{ID: c.ID, Label: c.Label, CreatedAt: c.CreatedAt, LastUsedAt: c.LastUsedAt})
			}
			return out, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-mfa-passkey-delete", Method: "DELETE", Path: "/api/v1/auth/mfa/passkeys/{id}", Summary: "Remove a passkey", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSessionMfa, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			ID int64 `path:"id"`
		}) (*struct{}, error) {
			p := principalOf(ctx)
			creds, _ := repo.CredentialsForUser(p.user.ID)
			onlyFactor := p.user.TotpSecret == nil && len(creds) <= 1
			if onlyFactor && auth.RoleRequiresMfa(repo, p.user.Role) {
				return nil, huma.Error409Conflict("cannot remove your only MFA method while MFA is required")
			}
			if err := repo.DeleteCredential(in.ID, p.user.ID); err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-mfa-passkey-challenge", Method: "POST", Path: "/api/v1/auth/mfa/passkeys/challenge", Summary: "Begin passkey step-up", Tags: tags, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, _ *struct{}) (*optionsOutput, error) {
			p := principalOf(ctx)
			creds, _ := repo.CredentialsForUser(p.user.ID)
			if len(creds) == 0 {
				return nil, huma.Error400BadRequest("no passkeys registered")
			}
			options, blob, err := wa.BeginLogin(s.waUser(p.user))
			if err != nil {
				return nil, huma.Error400BadRequest("could not start authentication")
			}
			s.deps.Auth.Challenges.Set("auth:"+p.session.ID, blob, transientTTL)
			return &optionsOutput{Body: toMap(options)}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "auth-mfa-passkey-verify", Method: "POST", Path: "/api/v1/auth/mfa/passkeys/verification", Summary: "Verify passkey step-up", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			Remember bool `query:"remember"`
			RawBody  []byte
		}) (*struct {
			SetCookie http.Cookie `header:"Set-Cookie"`
		}, error) {
			p := principalOf(ctx)
			blob, ok := s.deps.Auth.Challenges.Get("auth:" + p.session.ID)
			if !ok {
				return nil, huma.Error400BadRequest("no pending authentication; start again")
			}
			credID, newCounter, err := wa.FinishLogin(s.waUser(p.user), blob, in.RawBody)
			if err != nil {
				s.deps.Log.Warn("passkey authentication failed", "err", err)
				return nil, huma.Error401Unauthorized("passkey authentication failed")
			}
			_ = repo.UpdateCredentialCounter(credID, int64(newCounter))
			_ = s.deps.Auth.UpgradeToMfa(p.session.ID)
			_ = repo.TouchLogin(p.user.ID)
			return &struct {
				SetCookie http.Cookie `header:"Set-Cookie"`
			}{SetCookie: *s.rememberDeviceCookie(p.user.ID, in.Remember)}, nil
		})
}
