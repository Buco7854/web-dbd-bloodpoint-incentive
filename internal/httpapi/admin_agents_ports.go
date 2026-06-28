package httpapi

import (
	"context"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
)

// exportedAgent is the portable agent shape (carries the token hash, never the raw token).
type exportedAgent struct {
	ProvisionID *string `json:"provisionId"`
	TokenHash   string  `json:"tokenHash"`
	Region      string  `json:"region"`
	Provider    string  `json:"provider"`
	Platform    string  `json:"platform"`
	Label       *string `json:"label"`
	Enabled     bool    `json:"enabled"`
	Source      string  `json:"source"`
	PollMin     *string `json:"pollMin"`
	PollMax     *string `json:"pollMax"`
}

// skippedAgent reports an import row that was not applied, so the caller can see
// exactly what failed rather than getting a silent count.
type skippedAgent struct {
	Index       int     `json:"index"`
	ProvisionID *string `json:"provisionId"`
	Reason      string  `json:"reason"`
}

func (s *Server) registerAdminAgentPorts() {
	api := s.API

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-export-agents", Method: "GET", Path: "/api/v1/admin/agents/export", Summary: "Export agents as JSON"}, false),
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				Agents []exportedAgent `json:"agents"`
			}
		}, error) {
			rows, err := s.deps.Agents.ListAll()
			if err != nil {
				return nil, err
			}
			out := &struct {
				Body struct {
					Agents []exportedAgent `json:"agents"`
				}
			}{}
			out.Body.Agents = []exportedAgent{}
			for _, a := range rows {
				out.Body.Agents = append(out.Body.Agents, exportedAgent{
					ProvisionID: a.ProvisionID, TokenHash: a.TokenHash, Region: a.Region, Provider: a.Provider,
					Platform: string(a.Platform), Label: a.Label, Enabled: a.Enabled, Source: string(a.Source),
					PollMin: a.PollMin, PollMax: a.PollMax,
				})
			}
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-import-agents", Method: "POST", Path: "/api/v1/admin/agents/import", Summary: "Import agents (upsert by token hash)"}, true),
		func(ctx context.Context, in *struct {
			Body struct {
				Agents []exportedAgent `json:"agents"`
			}
		}) (*struct {
			Body struct {
				Imported int            `json:"imported"`
				Skipped  []skippedAgent `json:"skipped"`
			}
		}, error) {
			imported := 0
			skipped := []skippedAgent{}
			for i, a := range in.Body.Agents {
				switch {
				case a.TokenHash == "":
					skipped = append(skipped, skippedAgent{Index: i, ProvisionID: a.ProvisionID, Reason: "missing token hash"})
					continue
				case !domain.IsKnownRegion(a.Region):
					skipped = append(skipped, skippedAgent{Index: i, ProvisionID: a.ProvisionID, Reason: "unknown region: " + a.Region})
					continue
				case !domain.IsKnownProvider(a.Provider):
					skipped = append(skipped, skippedAgent{Index: i, ProvisionID: a.ProvisionID, Reason: "unknown provider: " + a.Provider})
					continue
				}
				enabled := a.Enabled
				source := db.AgentSource(a.Source)
				if source != db.SourceProvisioned {
					source = db.SourceManual
				}
				if _, err := s.deps.Agents.UpsertByTokenHash(db.NewAgent{
					TokenHash: a.TokenHash, Region: a.Region, Provider: a.Provider,
					Platform: domain.PlatformForProvider(a.Provider), Label: a.Label,
					Source: source, ProvisionID: a.ProvisionID, PollMin: a.PollMin, PollMax: a.PollMax,
					Enabled: &enabled,
				}); err != nil {
					return nil, err
				}
				imported++
			}
			if err := s.deps.Registry.Reload(); err != nil {
				return nil, err
			}
			out := &struct {
				Body struct {
					Imported int            `json:"imported"`
					Skipped  []skippedAgent `json:"skipped"`
				}
			}{}
			out.Body.Imported = imported
			out.Body.Skipped = skipped
			return out, nil
		})
}
