// Package httpapi wires the hub's HTTP transport: the chi router, the Huma API
// (which generates the OpenAPI 3.1 spec and serves interactive docs), and all
// operation handlers.
package httpapi

import (
	"context"
	"log/slog"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/config"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/orchestrator"
	"github.com/buco7854/bloodpoint-incentives/internal/presence"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
	"github.com/buco7854/bloodpoint-incentives/internal/store"
)

// Deps are the collaborators a Server needs.
type Deps struct {
	Config       *config.Config
	Store        *store.Store
	Orchestrator *orchestrator.Orchestrator
	Registry     *registry.Provider
	Readings     *db.ReadingsRepo
	Agents       *db.AgentsRepo
	Auth         *auth.AuthService
	AuthRepo     *db.AuthRepo
	Presence     presence.Tracker
	Log          *slog.Logger
	PublicDir    string
}

// Server holds the router and the Huma API instance.
type Server struct {
	Router  chi.Router
	API     huma.API
	deps    Deps
	start   time.Time
	reports reportLimiter
}

// New builds the router and Huma API and registers every operation.
func New(deps Deps) *Server {
	if deps.Log == nil {
		deps.Log = slog.Default()
	}
	if deps.Presence == nil {
		deps.Presence = presence.New()
	}
	router := chi.NewMux()
	if deps.Config != nil && len(deps.Config.CORSAllowedOrigins) > 0 {
		router.Use(corsMiddleware(deps.Config.CORSAllowedOrigins))
	}

	cfg := huma.DefaultConfig("Bloodpoint Incentives API", "1.0.0")
	cfg.Info.Description = "Programmatic access to Dead by Daylight bloodpoint incentive data."
	cfg.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		"session": {Type: "apiKey", In: "cookie", Name: auth.SessionCookie, Description: "Browser session cookie."},
		"apiKey":  {Type: "http", Scheme: "bearer", Description: "User API key: Authorization: Bearer bpi_..."},
		"agent":   {Type: "http", Scheme: "bearer", Description: "Agent bearer token."},
	}

	api := humachi.New(router, cfg)
	// Point the OpenAPI spec (and its "Try it" calls) at the real public origin.
	if deps.Config != nil && deps.Config.Auth.Origin != "" {
		api.OpenAPI().Servers = []*huma.Server{{URL: deps.Config.Auth.Origin}}
	}

	s := &Server{Router: router, API: api, deps: deps, start: time.Now()}
	if deps.Auth != nil {
		api.UseMiddleware(s.attach)
	}
	s.registerHealth()
	s.registerPublic()
	s.registerStream()
	s.registerAgentRoutes()
	if deps.Auth != nil {
		s.registerAuthRoutes()
		s.registerAdminRoutes()
	}
	s.registerStatic() // catch-all; must be registered last
	return s
}

type healthOutput struct {
	Body struct {
		Status           string `json:"status" example:"ok"`
		UptimeSeconds    int64  `json:"uptimeSeconds"`
		AgentsConfigured int    `json:"agentsConfigured"`
		RegionsReporting int    `json:"regionsReporting"`
	}
}

func (s *Server) registerHealth() {
	huma.Register(s.API, huma.Operation{
		OperationID: "get-health",
		Method:      "GET",
		Path:        "/healthz",
		Summary:     "Health check",
		Tags:        []string{"system"},
	}, func(ctx context.Context, _ *struct{}) (*healthOutput, error) {
		out := &healthOutput{}
		out.Body.Status = "ok"
		out.Body.UptimeSeconds = int64(time.Since(s.start).Seconds())
		out.Body.AgentsConfigured = s.deps.Registry.Current().Size()
		out.Body.RegionsReporting = s.deps.Store.RegionsReporting()
		return out, nil
	})
}
