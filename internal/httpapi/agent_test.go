package httpapi

import (
	"fmt"
	"testing"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/config"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/orchestrator"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
	"github.com/buco7854/bloodpoint-incentives/internal/store"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

func TestAgentReadingFlow(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	readings, _ := db.NewReadingsRepo(conn)
	agents, _ := db.NewAgentsRepo(conn)
	agents.Create(db.NewAgent{TokenHash: token.Hash("k1"), Region: "eu-central-1", Provider: "steam", Platform: domain.PlatformWindows, Source: db.SourceManual})
	prov, _ := registry.NewProvider(agents.ListEnabled)
	st := store.New(prov.Current, store.Meta{PageSize: 20, StaleAfterSeconds: 900, AgentSetupURL: "x"}, readings, nil, nil)
	srv := New(Deps{
		Config: &config.Config{DataRetentionDays: 31, ForecastWindowDays: 84},
		Store:  st, Orchestrator: orchestrator.New(prov.Current, domain.CadenceSpec{Min: "300", Max: "400"}, 300),
		Registry: prov, Readings: readings, Agents: agents,
	})

	bearer := map[string]string{"Authorization": "Bearer k1"}

	if rec := do(srv, "GET", "/api/v1/agent/assignment", "", bearer); rec.Code != 200 {
		t.Fatalf("assignment = %d", rec.Code)
	}
	if rec := do(srv, "GET", "/api/v1/agent/assignment", "", map[string]string{"Authorization": "Bearer nope"}); rec.Code != 401 {
		t.Fatalf("bad-token assignment = %d, want 401", rec.Code)
	}

	now := domain.ISOFromMs(time.Now().UnixMilli())
	body := func(region string) string {
		return fmt.Sprintf(`{"region":%q,"platform":"Windows","survivor":100,"killer":0,"ratio":2.5,"isReal":true,"measuredAt":%q}`, region, now)
	}
	if rec := do(srv, "POST", "/api/v1/agent/readings", body("eu-central-1"), bearer); rec.Code != 201 {
		t.Fatalf("report = %d: %s", rec.Code, rec.Body)
	}
	if rec := do(srv, "POST", "/api/v1/agent/readings", body("us-east-1"), bearer); rec.Code != 400 {
		t.Fatalf("mismatch report = %d, want 400", rec.Code)
	}
	if rec := do(srv, "POST", "/api/v1/agent/readings", body("eu-central-1"), bearer); rec.Code != 429 {
		t.Fatalf("rapid report = %d, want 429", rec.Code)
	}

	if rec := do(srv, "GET", "/api/v1/platforms/Windows/incentives", "", nil); rec.Code != 200 {
		t.Fatalf("snapshot = %d", rec.Code)
	}
}
