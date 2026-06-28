package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/config"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/orchestrator"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
	"github.com/buco7854/bloodpoint-incentives/internal/store"
)

func newTestServer(t *testing.T) (*Server, *store.Store) {
	t.Helper()
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	readings, _ := db.NewReadingsRepo(conn)
	agents, _ := db.NewAgentsRepo(conn)
	agents.Create(db.NewAgent{TokenHash: "h", Region: "eu-central-1", Provider: "steam", Platform: domain.PlatformWindows, Source: db.SourceManual})
	prov, _ := registry.NewProvider(agents.ListEnabled)
	st := store.New(prov.Current, store.Meta{PageSize: 20, StaleAfterSeconds: 900, AgentSetupURL: "x"}, readings, nil, nil)
	cfg := &config.Config{DataRetentionDays: 31, ForecastWindowDays: 84}
	srv := New(Deps{Config: cfg, Store: st, Orchestrator: orchestrator.New(prov.Current, domain.CadenceSpec{Min: "300", Max: "400"}, 300), Registry: prov, Readings: readings, Agents: agents})
	return srv, st
}

func TestIncentivesEndpoint(t *testing.T) {
	srv, st := newTestServer(t)
	st.Ingest(domain.AgentReport{Region: "eu-central-1", Platform: domain.PlatformWindows, Survivor: 75, Ratio: 2, IsReal: true, MeasuredAt: domain.ISOFromMs(time.Now().UnixMilli())}, nil)

	req := httptest.NewRequest("GET", "/api/v1/platforms/Windows/incentives", nil)
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var payload domain.IncentivesPayload
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Regions) != 1 || payload.Regions[0].Survivor != 75 {
		t.Fatalf("unexpected payload: %+v", payload.Regions)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "max-age=15") {
		t.Errorf("unexpected Cache-Control %q", cc)
	}
}

func TestUnknownPlatformRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest("GET", "/api/v1/platforms/Nope/incentives", nil)
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestForecastEndpoint(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest("GET", "/api/v1/platforms/Windows/regions/eu-central-1/forecast", nil)
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body forecastBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Points) != 24 {
		t.Fatalf("want 24 forecast points, got %d", len(body.Points))
	}
}
