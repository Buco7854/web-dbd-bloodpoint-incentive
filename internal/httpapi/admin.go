package httpapi

import (
	"context"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

type adminAgent struct {
	ID            int64   `json:"id"`
	ProvisionID   *string `json:"provisionId"`
	Region        string  `json:"region"`
	Provider      string  `json:"provider"`
	Platform      string  `json:"platform"`
	Label         *string `json:"label"`
	Enabled       bool    `json:"enabled"`
	Source        string  `json:"source"`
	PollMin       *string `json:"pollMin"`
	PollMax       *string `json:"pollMax"`
	Readings      int     `json:"readings"`
	LastReadingAt *int64  `json:"lastReadingAt"`
}

func (s *Server) toAdminAgent(a db.AgentRow, stats map[int64]db.AgentStat) adminAgent {
	out := adminAgent{
		ID: a.ID, ProvisionID: a.ProvisionID, Region: a.Region, Provider: a.Provider,
		Platform: string(a.Platform), Label: a.Label, Enabled: a.Enabled, Source: string(a.Source),
		PollMin: a.PollMin, PollMax: a.PollMax,
	}
	if st, ok := stats[a.ID]; ok {
		out.Readings = st.Count
		la := st.LastAt
		out.LastReadingAt = &la
	}
	return out
}

func (s *Server) adminOp(op huma.Operation, mutating bool) huma.Operation {
	op.Tags = []string{"admin"}
	op.Security = []map[string][]string{{"session": {}}, {"apiKey": {}}}
	if mutating {
		op.Middlewares = huma.Middlewares{s.mwAdmin, s.mwCSRF}
	} else {
		op.Middlewares = huma.Middlewares{s.mwAdmin}
	}
	return op
}

func (s *Server) registerAdminRoutes() {
	api := s.API
	s.registerAdminAgents()
	s.registerAdminUsers()

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-presence", Method: "GET", Path: "/api/v1/admin/presence", Summary: "Current unique viewer count"}, false),
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				Online int `json:"online"`
			}
		}, error) {
			out := &struct {
				Body struct {
					Online int `json:"online"`
				}
			}{}
			out.Body.Online = s.deps.Presence.Count()
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-get-settings", Method: "GET", Path: "/api/v1/admin/settings", Summary: "Read app settings"}, false),
		func(ctx context.Context, _ *struct{}) (*struct{ Body adminSettings }, error) {
			return &struct{ Body adminSettings }{Body: s.readSettings()}, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-update-settings", Method: "PATCH", Path: "/api/v1/admin/settings", Summary: "Update app settings"}, true),
		func(ctx context.Context, in *struct {
			Body struct {
				MfaEnforcedRoles *[]string `json:"mfaEnforcedRoles,omitempty"`
				RequireAuth      *bool     `json:"requireAuth,omitempty"`
				EnableAPIKeys    *bool     `json:"enableApiKeys,omitempty"`
			}
		}) (*struct{ Body adminSettings }, error) {
			repo := s.deps.AuthRepo
			if in.Body.MfaEnforcedRoles != nil {
				roles := []db.UserRole{}
				for _, r := range *in.Body.MfaEnforcedRoles {
					if db.IsUserRole(r) {
						roles = append(roles, db.UserRole(r))
					}
				}
				_ = auth.SetMfaEnforcedRoles(repo, roles)
			}
			if in.Body.RequireAuth != nil {
				_ = auth.SetRequireAuth(repo, *in.Body.RequireAuth)
			}
			if in.Body.EnableAPIKeys != nil {
				_ = auth.SetEnableAPIKeys(repo, *in.Body.EnableAPIKeys)
			}
			return &struct{ Body adminSettings }{Body: s.readSettings()}, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-delete-orphans", Method: "DELETE", Path: "/api/v1/admin/readings/orphans", Summary: "Delete orphaned readings"}, true),
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				Removed int64 `json:"removed"`
			}
		}, error) {
			n, _ := s.deps.Readings.DeleteOrphans()
			out := &struct {
				Body struct {
					Removed int64 `json:"removed"`
				}
			}{}
			out.Body.Removed = n
			return out, nil
		})
}

type adminSettings struct {
	MfaEnforcedRoles []db.UserRole `json:"mfaEnforcedRoles"`
	RequireAuth      bool          `json:"requireAuth"`
	EnableAPIKeys    bool          `json:"enableApiKeys"`
}

func (s *Server) readSettings() adminSettings {
	return adminSettings{
		MfaEnforcedRoles: auth.MfaEnforcedRoles(s.deps.AuthRepo),
		RequireAuth:      auth.GetRequireAuth(s.deps.AuthRepo),
		EnableAPIKeys:    auth.GetEnableAPIKeys(s.deps.AuthRepo),
	}
}

func validProvider(p string) (domain.Platform, error) {
	p = strings.ToLower(strings.TrimSpace(p))
	if !domain.IsKnownProvider(p) || !domain.IsSupportedProvider(p) {
		return "", huma.Error400BadRequest("unknown or unsupported provider")
	}
	return domain.PlatformForProvider(p), nil
}

// regenToken mints a new token for an agent and returns the raw value once.
func (s *Server) regenToken(id int64) (string, error) {
	raw := token.Generate()
	if err := s.deps.Agents.SetTokenHash(id, token.Hash(raw)); err != nil {
		return "", err
	}
	return raw, s.deps.Registry.Reload()
}
