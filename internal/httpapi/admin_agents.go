package httpapi

import (
	"context"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

func (s *Server) registerAdminAgents() {
	api := s.API

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-list-agents", Method: "GET", Path: "/api/v1/admin/agents", Summary: "List managed agents"}, false),
		func(ctx context.Context, _ *struct{}) (*struct {
			Body struct {
				Agents []adminAgent `json:"agents"`
			}
		}, error) {
			rows, err := s.deps.Agents.ListAll()
			if err != nil {
				return nil, err
			}
			stats, _ := s.deps.Readings.ReadingStatsByAgent()
			out := &struct {
				Body struct {
					Agents []adminAgent `json:"agents"`
				}
			}{}
			out.Body.Agents = []adminAgent{}
			for _, r := range rows {
				out.Body.Agents = append(out.Body.Agents, s.toAdminAgent(r, stats))
			}
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-create-agent", Method: "POST", Path: "/api/v1/admin/agents", Summary: "Create an agent (token shown once)", DefaultStatus: 201}, true),
		func(ctx context.Context, in *struct {
			Body struct {
				Region   string  `json:"region"`
				Provider string  `json:"provider"`
				Label    *string `json:"label,omitempty"`
			}
		}) (*struct {
			Body struct {
				Agent adminAgent `json:"agent"`
				Token string     `json:"token"`
			}
		}, error) {
			if !domain.IsKnownRegion(in.Body.Region) {
				return nil, huma.Error400BadRequest("unknown region")
			}
			platform, err := validProvider(in.Body.Provider)
			if err != nil {
				return nil, err
			}
			raw := token.Generate()
			row, err := s.deps.Agents.Create(db.NewAgent{
				TokenHash: token.Hash(raw), Region: in.Body.Region, Provider: in.Body.Provider,
				Platform: platform, Label: in.Body.Label, Source: db.SourceManual,
			})
			if err != nil {
				return nil, err
			}
			if err := s.deps.Registry.Reload(); err != nil {
				return nil, err
			}
			out := &struct {
				Body struct {
					Agent adminAgent `json:"agent"`
					Token string     `json:"token"`
				}
			}{}
			out.Body.Agent = s.toAdminAgent(row, nil)
			out.Body.Token = raw
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-update-agent", Method: "PATCH", Path: "/api/v1/admin/agents/{id}", Summary: "Update an agent"}, true),
		func(ctx context.Context, in *struct {
			ID   int64 `path:"id"`
			Body struct {
				Label    *string `json:"label,omitempty"`
				Provider *string `json:"provider,omitempty"`
				PollMin  *string `json:"pollMin,omitempty"`
				PollMax  *string `json:"pollMax,omitempty"`
				Enabled  *bool   `json:"enabled,omitempty"`
				Region   *string `json:"region,omitempty"`
				DataMode *string `json:"dataMode,omitempty"`
			}
		}) (*struct {
			Body struct {
				Agent adminAgent `json:"agent"`
			}
		}, error) {
			cur, ok, err := s.deps.Agents.GetByID(in.ID)
			if err != nil || !ok {
				return nil, huma.Error404NotFound("agent not found")
			}

			patch := db.AgentPatch{}
			if in.Body.Label != nil {
				patch.SetLabel = true
				patch.Label = in.Body.Label
			}
			if in.Body.PollMin != nil {
				patch.SetPollMin = true
				patch.PollMin = in.Body.PollMin
			}
			if in.Body.PollMax != nil {
				patch.SetPollMax = true
				patch.PollMax = in.Body.PollMax
			}
			if in.Body.Provider != nil {
				platform, err := validProvider(*in.Body.Provider)
				if err != nil {
					return nil, err
				}
				p := *in.Body.Provider
				patch.Provider = &p
				patch.Platform = &platform
			}
			if err := s.deps.Agents.Update(in.ID, patch); err != nil {
				return nil, err
			}
			if in.Body.Enabled != nil {
				if err := s.deps.Agents.SetEnabled(in.ID, *in.Body.Enabled); err != nil {
					return nil, err
				}
			}
			if in.Body.Region != nil && *in.Body.Region != cur.Region {
				if err := s.changeAgentRegion(cur, *in.Body.Region, in.Body.DataMode); err != nil {
					return nil, err
				}
			}
			if err := s.deps.Registry.Reload(); err != nil {
				return nil, err
			}

			row, _, _ := s.deps.Agents.GetByID(in.ID)
			stats, _ := s.deps.Readings.ReadingStatsByAgent()
			out := &struct {
				Body struct {
					Agent adminAgent `json:"agent"`
				}
			}{}
			out.Body.Agent = s.toAdminAgent(row, stats)
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-rotate-token", Method: "POST", Path: "/api/v1/admin/agents/{id}/token", Summary: "Rotate an agent's token"}, true),
		func(ctx context.Context, in *struct {
			ID int64 `path:"id"`
		}) (*struct {
			Body struct {
				Token string `json:"token"`
			}
		}, error) {
			if _, ok, _ := s.deps.Agents.GetByID(in.ID); !ok {
				return nil, huma.Error404NotFound("agent not found")
			}
			raw, err := s.regenToken(in.ID)
			if err != nil {
				return nil, err
			}
			out := &struct {
				Body struct {
					Token string `json:"token"`
				}
			}{}
			out.Body.Token = raw
			return out, nil
		})

	huma.Register(api, s.adminOp(huma.Operation{OperationID: "admin-delete-agent", Method: "DELETE", Path: "/api/v1/admin/agents/{id}", Summary: "Delete an agent", DefaultStatus: 204}, true),
		func(ctx context.Context, in *struct {
			ID       int64  `path:"id"`
			DataMode string `query:"dataMode" enum:"orphan,delete" default:"orphan"`
		}) (*struct{}, error) {
			cur, ok, _ := s.deps.Agents.GetByID(in.ID)
			if !ok {
				return nil, huma.Error404NotFound("agent not found")
			}
			if in.DataMode == "delete" {
				_, _ = s.deps.Readings.PruneByAgent(in.ID)
			} else {
				_, _ = s.deps.Readings.OrphanAgentReadings(in.ID)
			}
			if err := s.deps.Agents.Delete(in.ID); err != nil {
				return nil, err
			}
			s.deps.Store.Evict(cur.Platform, cur.Region)
			if err := s.deps.Registry.Reload(); err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})

	s.registerAdminAgentPorts()
}

// changeAgentRegion moves an agent, applying the data mode (keep/orphan/delete),
// then evicts the old region's live tile. History is never rewritten.
func (s *Server) changeAgentRegion(cur db.AgentRow, region string, dataMode *string) error {
	if !domain.IsKnownRegion(region) {
		return huma.Error400BadRequest("unknown region")
	}
	mode := "keep"
	if dataMode != nil {
		mode = *dataMode
	}
	switch mode {
	case "orphan":
		_, _ = s.deps.Readings.OrphanAgentReadings(cur.ID)
	case "delete":
		_, _ = s.deps.Readings.PruneByAgent(cur.ID)
	}
	if err := s.deps.Agents.SetRegion(cur.ID, region); err != nil {
		return err
	}
	s.deps.Store.Evict(cur.Platform, cur.Region)
	return nil
}
