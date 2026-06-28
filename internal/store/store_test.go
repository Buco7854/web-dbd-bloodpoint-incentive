package store

import (
	"log/slog"
	"testing"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
)

func newTestStore(t *testing.T) (*Store, *db.AgentsRepo, *registry.Provider) {
	t.Helper()
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	readings, err := db.NewReadingsRepo(conn)
	if err != nil {
		t.Fatal(err)
	}
	agents, err := db.NewAgentsRepo(conn)
	if err != nil {
		t.Fatal(err)
	}
	prov, err := registry.NewProvider(agents.ListEnabled)
	if err != nil {
		t.Fatal(err)
	}
	s := New(prov.Current, Meta{PageSize: 20, StaleAfterSeconds: 900, AgentSetupURL: "x"}, readings, slog.Default(), nil)
	return s, agents, prov
}

func TestIngestAndSnapshot(t *testing.T) {
	s, agents, prov := newTestStore(t)
	if _, err := agents.Create(db.NewAgent{
		TokenHash: "hash1", Region: "eu-central-1", Provider: "steam",
		Platform: domain.PlatformWindows, Source: db.SourceManual,
	}); err != nil {
		t.Fatal(err)
	}
	if err := prov.Reload(); err != nil {
		t.Fatal(err)
	}

	now := time.Now()
	ok := s.Ingest(domain.AgentReport{
		Region: "eu-central-1", Platform: domain.PlatformWindows,
		Survivor: 75, Killer: 0, Ratio: 2.1, IsReal: true,
		MeasuredAt: domain.ISOFromMs(now.UnixMilli()),
	}, nil)
	if !ok {
		t.Fatal("ingest rejected a fresh reading")
	}

	snap := s.Incentives(domain.PlatformWindows, now)
	if len(snap.Regions) != 1 {
		t.Fatalf("want 1 region, got %d", len(snap.Regions))
	}
	r := snap.Regions[0]
	if r.Region != "eu-central-1" || r.Survivor != 75 || !r.IsReal || r.Stale {
		t.Fatalf("unexpected region: %+v", r)
	}
	if snap.Status != domain.StatusOK {
		t.Fatalf("status = %v, want ok", snap.Status)
	}

	cov := s.Coverage(domain.PlatformWindows)
	var covered int
	for _, c := range cov.Regions {
		if c.Region == "eu-central-1" {
			covered = c.Agents
		}
	}
	if covered != 1 {
		t.Fatalf("expected 1 agent covering eu-central-1, got %d", covered)
	}
}

func TestIngestRejectsOlder(t *testing.T) {
	s, agents, prov := newTestStore(t)
	agents.Create(db.NewAgent{TokenHash: "h", Region: "us-east-1", Provider: "steam", Platform: domain.PlatformWindows, Source: db.SourceManual})
	prov.Reload()

	now := time.Now()
	newer := domain.AgentReport{Region: "us-east-1", Platform: domain.PlatformWindows, Survivor: 50, Ratio: 1, IsReal: true, MeasuredAt: domain.ISOFromMs(now.UnixMilli())}
	older := newer
	older.Survivor = 100
	older.MeasuredAt = domain.ISOFromMs(now.Add(-time.Minute).UnixMilli())

	if !s.Ingest(newer, nil) {
		t.Fatal("first ingest rejected")
	}
	if s.Ingest(older, nil) {
		t.Fatal("older reading should be rejected")
	}
	snap := s.Incentives(domain.PlatformWindows, now)
	if snap.Regions[0].Survivor != 50 {
		t.Fatalf("stale write won: %d", snap.Regions[0].Survivor)
	}
}
