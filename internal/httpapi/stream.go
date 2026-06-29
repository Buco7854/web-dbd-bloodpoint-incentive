package httpapi

import (
	"context"
	"encoding/json"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/sse"

	"github.com/buco7854/bloodpoint-incentives/internal/domain"
)

const (
	presenceTTL     = 45 * time.Second
	streamStaleTick = 30 * time.Second
	streamHeartbeat = 15 * time.Second
)

type streamInput struct {
	Platform string `path:"platform" enum:"Windows,EGS,GRDK"`
}

type pingPayload struct {
	T int64 `json:"t"`
}

func (s *Server) registerStream() {
	sse.Register(s.API, huma.Operation{
		OperationID: "stream-incentives",
		Method:      "GET",
		Path:        "/api/v1/platforms/{platform}/incentives/stream",
		Summary:     "Live incentives stream (Server-Sent Events)",
		Tags:        []string{"incentives"},
		Security:    readSecurity,
		Middlewares: huma.Middlewares{s.mwReadGate, s.mwNoBuffer, s.mwClientIP},
	}, map[string]any{
		"message": domain.IncentivesPayload{},
		"ping":    pingPayload{},
	}, func(ctx context.Context, in *streamInput, send sse.Sender) {
		if !domain.IsKnownPlatform(in.Platform) {
			return
		}
		// Bound concurrent streams: take a slot or refuse. Each open stream holds a
		// goroutine + tickers, so an unbounded count is a resource-exhaustion lever.
		select {
		case s.streamSlots <- struct{}{}:
			defer func() { <-s.streamSlots }()
		default:
			_ = send(sse.Message{Data: pingPayload{T: time.Now().UnixMilli()}})
			return
		}
		platform := domain.Platform(in.Platform)

		visitorID := clientIPOf(ctx)
		if visitorID == "" {
			visitorID = "anon-" + domain.ISOFromMs(time.Now().UnixNano())
		}
		s.deps.Presence.Touch(visitorID, presenceTTL)

		changes := make(chan struct{}, 1)
		off := s.deps.Store.OnChange(func(p domain.Platform) {
			if p != platform {
				return
			}
			select {
			case changes <- struct{}{}:
			default:
			}
		})
		defer off()

		last := ""
		push := func() {
			snap := s.deps.Store.Incentives(platform, time.Now())
			raw, err := json.Marshal(snap)
			if err != nil || string(raw) == last {
				return
			}
			last = string(raw)
			_ = send(sse.Message{Data: snap})
		}

		push()
		stale := time.NewTicker(streamStaleTick)
		defer stale.Stop()
		heartbeat := time.NewTicker(streamHeartbeat)
		defer heartbeat.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-changes:
				push()
			case <-stale.C:
				push()
			case <-heartbeat.C:
				s.deps.Presence.Touch(visitorID, presenceTTL)
				_ = send(sse.Message{Data: pingPayload{T: time.Now().UnixMilli()}})
			}
		}
	})
}
