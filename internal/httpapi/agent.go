package httpapi

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
	"github.com/buco7854/bloodpoint-incentives/internal/report"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

const (
	reportRateTolerance = 0.8
	lastReportTTL       = time.Hour
)

type agentCtxKey int

const agentSlotKey agentCtxKey = iota

func agentSlotOf(ctx context.Context) (registry.Slot, bool) {
	s, ok := ctx.Value(agentSlotKey).(registry.Slot)
	return s, ok
}

// mwAgent authenticates the calling agent by its bearer token.
func (s *Server) mwAgent(ctx huma.Context, next func(huma.Context)) {
	authz := ctx.Header("Authorization")
	key, ok := strings.CutPrefix(authz, "Bearer ")
	key = strings.TrimSpace(key)
	if !ok || key == "" {
		s.reject(ctx, 401, "unknown agent key")
		return
	}
	slot, found := s.deps.Registry.Current().LookupByTokenHash(token.Hash(key))
	if !found {
		s.reject(ctx, 401, "unknown agent key")
		return
	}
	next(huma.WithValue(ctx, agentSlotKey, slot))
}

func (s *Server) assignmentFor(slot registry.Slot) domain.AgentAssignment {
	return s.deps.Orchestrator.AssignmentFor(slot, s.deps.Store.RefreshTimeFor(slot.Region, slot.Platform))
}

func agentSecurity() []map[string][]string { return []map[string][]string{{"agent": {}}} }

func (s *Server) registerAgentRoutes() {
	api := s.API

	huma.Register(api, huma.Operation{
		OperationID: "agent-assignment", Method: "GET", Path: "/api/v1/agent/assignment",
		Summary: "The calling agent's current assignment", Tags: []string{"agent"},
		Security: agentSecurity(), Middlewares: huma.Middlewares{s.mwAgent},
	}, func(ctx context.Context, _ *struct{}) (*struct {
		CacheControl string                 `header:"Cache-Control"`
		Body         domain.AgentAssignment `contentType:"application/json"`
	}, error) {
		slot, _ := agentSlotOf(ctx)
		return &struct {
			CacheControl string                 `header:"Cache-Control"`
			Body         domain.AgentAssignment `contentType:"application/json"`
		}{CacheControl: "no-store", Body: s.assignmentFor(slot)}, nil
	})

	// The reply echoes the agent's current assignment so it can re-sync its cadence
	// without a separate GET after each reading.
	type reportResult struct {
		Assignment domain.AgentAssignment `json:"assignment"`
	}

	huma.Register(api, huma.Operation{
		OperationID: "agent-submit-reading", Method: "POST", Path: "/api/v1/agent/readings",
		Summary: "Submit a reading", Tags: []string{"agent"}, DefaultStatus: 201,
		Security: agentSecurity(), Middlewares: huma.Middlewares{s.mwAgent},
		Errors: []int{400, 401, 429},
	}, func(ctx context.Context, in *struct{ Body report.Input }) (*struct{ Body reportResult }, error) {
		slot, _ := agentSlotOf(ctx)
		now := time.Now()

		rep, verr := report.Validate(in.Body, slot, now.UnixMilli())
		if verr != nil {
			// A just-moved agent re-syncs on its next assignment poll.
			return nil, huma.Error400BadRequest(verr.Error())
		}

		assignment := s.assignmentFor(slot)
		rateKey := string(slot.Platform) + " " + slot.Region + " " + itoa(int64(slot.Index))
		minGap := time.Duration(float64(assignment.PollMinSeconds)*1000*reportRateTolerance) * time.Millisecond
		if !s.allowReport(rateKey, now, minGap) {
			return nil, huma.Error429TooManyRequests("reporting faster than the assigned schedule allows")
		}

		s.deps.Store.Ingest(rep, slotAgentID(slot))
		return &struct{ Body reportResult }{Body: reportResult{Assignment: assignment}}, nil
	})
}

func slotAgentID(slot registry.Slot) *int64 {
	id := slot.AgentID
	return &id
}

// reportLimiter is the per-slot rate-limit state.
type reportLimiter struct {
	mu   sync.Mutex
	last map[string]time.Time
}

func (s *Server) allowReport(key string, now time.Time, minGap time.Duration) bool {
	s.reports.mu.Lock()
	defer s.reports.mu.Unlock()
	if s.reports.last == nil {
		s.reports.last = map[string]time.Time{}
	}
	if t, ok := s.reports.last[key]; ok && now.Sub(t) < minGap {
		return false
	}
	if len(s.reports.last) > 1000 {
		for k, t := range s.reports.last {
			if now.Sub(t) > lastReportTTL {
				delete(s.reports.last, k)
			}
		}
	}
	s.reports.last[key] = now
	return true
}
