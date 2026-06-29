package httpapi

import (
	"context"
	"encoding/base64"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
)

// rememberDeviceCookie returns a trusted-device cookie when remember is set, else
// a cleared one, so the Set-Cookie response header is always well-formed.
func (s *Server) rememberDeviceCookie(userID int64, remember bool) *http.Cookie {
	if remember {
		if c, err := s.deps.Auth.RememberDevice(userID, nil); err == nil {
			return c
		}
	}
	return s.deps.Auth.ClearedDeviceCookie()
}

// qrDataURL renders the otpauth URI as a base64 PNG data URL for the UI.
func qrDataURL(uri string) string {
	png, err := qrcode.Encode(uri, qrcode.Medium, 256)
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
}

func (s *Server) registerMfaRoutes() {
	api, repo := s.API, s.deps.AuthRepo
	tags := []string{"auth"}

	// Choose the MFA-enforcement policy (first admin, before enrolling).
	huma.Register(api, huma.Operation{OperationID: "auth-mfa-policy", Method: "POST", Path: "/api/v1/auth/mfa/policy", Summary: "Set the MFA-enforcement policy", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			Body struct {
				Roles []string `json:"roles"`
			}
		}) (*struct{}, error) {
			p := principalOf(ctx)
			if p.user.Role != db.RoleAdmin {
				return nil, huma.Error403Forbidden("admin role required")
			}
			if auth.IsMfaPolicyChosen(repo) {
				return nil, huma.Error409Conflict("policy already set")
			}
			roles := []db.UserRole{}
			for _, r := range in.Body.Roles {
				if db.IsUserRole(r) {
					roles = append(roles, db.UserRole(r))
				}
			}
			if err := auth.SetMfaEnforcedRoles(repo, roles); err != nil {
				return nil, err
			}
			if auth.DecideLoginNext(repo, p.user).Next == "ok" {
				_ = s.deps.Auth.UpgradeToMfa(p.session.ID)
				_ = repo.TouchLogin(p.user.ID)
			}
			return &struct{}{}, nil
		})

	// Enroll TOTP: returns the secret + otpauth URI to render as a QR.
	huma.Register(api, huma.Operation{OperationID: "auth-mfa-totp-enroll", Method: "POST", Path: "/api/v1/auth/mfa/totp", Summary: "Begin TOTP enrollment", Tags: tags, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				Secret string `json:"secret"`
				URI    string `json:"uri"`
				QR     string `json:"qr"`
			}
		}, error) {
			p := principalOf(ctx)
			secret := auth.GenerateTotpSecret()
			s.deps.Auth.PendingTotp.Set(p.session.ID, secret, transientTTL)
			uri := auth.TotpAuthURI(secret, p.user.Username, s.deps.Auth.RPName)
			out := &struct {
				Body struct {
					Secret string `json:"secret"`
					URI    string `json:"uri"`
					QR     string `json:"qr"`
				}
			}{}
			out.Body.Secret = secret
			out.Body.URI = uri
			out.Body.QR = qrDataURL(uri)
			return out, nil
		})

	// Activate TOTP (completes enrollment + satisfies MFA).
	huma.Register(api, huma.Operation{OperationID: "auth-mfa-totp-activate", Method: "POST", Path: "/api/v1/auth/mfa/totp/activation", Summary: "Activate TOTP", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			Body struct {
				Code string `json:"code"`
			}
		}) (*struct{}, error) {
			p := principalOf(ctx)
			if s.throttle("mfa|" + itoa(p.user.ID)) {
				return nil, huma.Error429TooManyRequests("too many attempts; try again later")
			}
			secret, ok := s.deps.Auth.PendingTotp.Get(p.session.ID)
			if !ok {
				return nil, huma.Error400BadRequest("no pending enrollment; start again")
			}
			step, ok := auth.VerifyTotpStep(secret, in.Body.Code, time.Now(), 1)
			if !ok {
				return nil, huma.Error400BadRequest("incorrect code")
			}
			s.deps.Auth.Throttle.Delete("mfa|" + itoa(p.user.ID))
			if err := repo.SetTotpSecret(p.user.ID, &secret); err != nil {
				return nil, err
			}
			_ = repo.SetTotpLastStep(p.user.ID, step)
			_ = s.deps.Auth.UpgradeToMfa(p.session.ID)
			_ = repo.TouchLogin(p.user.ID)
			return &struct{}{}, nil
		})

	// Step-up: satisfy MFA with an existing TOTP secret.
	huma.Register(api, huma.Operation{OperationID: "auth-mfa-totp-verify", Method: "POST", Path: "/api/v1/auth/mfa/totp/verification", Summary: "Verify TOTP (step-up)", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSession, s.mwCSRF}},
		func(ctx context.Context, in *struct {
			Body struct {
				Code           string `json:"code"`
				RememberDevice bool   `json:"rememberDevice,omitempty"`
			}
		}) (*struct {
			SetCookie http.Cookie `header:"Set-Cookie"`
		}, error) {
			p := principalOf(ctx)
			if s.throttle("mfa|" + itoa(p.user.ID)) {
				return nil, huma.Error429TooManyRequests("too many attempts; try again later")
			}
			if p.user.TotpSecret == nil {
				return nil, huma.Error401Unauthorized("incorrect code")
			}
			step, ok := auth.VerifyTotpStep(*p.user.TotpSecret, in.Body.Code, time.Now(), 1)
			if !ok {
				return nil, huma.Error401Unauthorized("incorrect code")
			}
			// Reject replay: each time-step may be accepted at most once.
			if last, _ := repo.GetTotpLastStep(p.user.ID); step <= last {
				return nil, huma.Error401Unauthorized("code already used; wait for the next code")
			}
			_ = repo.SetTotpLastStep(p.user.ID, step)
			s.deps.Auth.Throttle.Delete("mfa|" + itoa(p.user.ID))
			_ = s.deps.Auth.UpgradeToMfa(p.session.ID)
			_ = repo.TouchLogin(p.user.ID)
			return &struct {
				SetCookie http.Cookie `header:"Set-Cookie"`
			}{SetCookie: *s.rememberDeviceCookie(p.user.ID, in.Body.RememberDevice)}, nil
		})

	// Disable TOTP.
	huma.Register(api, huma.Operation{OperationID: "auth-mfa-totp-disable", Method: "DELETE", Path: "/api/v1/auth/mfa/totp", Summary: "Disable TOTP", Tags: tags, DefaultStatus: 204, Middlewares: huma.Middlewares{s.mwSessionMfa, s.mwCSRF}},
		func(ctx context.Context, _ *struct{}) (*struct{}, error) {
			p := principalOf(ctx)
			creds, _ := repo.CredentialsForUser(p.user.ID)
			if len(creds) == 0 && auth.RoleRequiresMfa(repo, p.user.Role) {
				return nil, huma.Error409Conflict("cannot remove your only MFA method while MFA is required")
			}
			if err := repo.SetTotpSecret(p.user.ID, nil); err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})
}
