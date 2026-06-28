// Command hub is the Bloodpoint Incentives aggregation server.
package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/buco7854/bloodpoint-incentives/internal/auth"
	"github.com/buco7854/bloodpoint-incentives/internal/config"
	"github.com/buco7854/bloodpoint-incentives/internal/db"
	"github.com/buco7854/bloodpoint-incentives/internal/httpapi"
	"github.com/buco7854/bloodpoint-incentives/internal/orchestrator"
	"github.com/buco7854/bloodpoint-incentives/internal/presence"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
	"github.com/buco7854/bloodpoint-incentives/internal/store"
	"github.com/buco7854/bloodpoint-incentives/internal/token"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: parseLevel(cfg.LogLevel)}))

	conn, err := db.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer conn.Close()

	readings, err := db.NewReadingsRepo(conn)
	if err != nil {
		return err
	}
	agents, err := db.NewAgentsRepo(conn)
	if err != nil {
		return err
	}

	if _, err := registry.ApplyProvisioning(agents, cfg.ProvisionAgents, logger); err != nil {
		return err
	}
	provider, err := registry.NewProvider(agents.ListEnabled)
	if err != nil {
		return err
	}

	st := store.New(provider.Current, store.Meta{
		ContactEmail:      cfg.ContactEmail,
		PageSize:          cfg.PageSize,
		StaleAfterSeconds: cfg.StaleAfterSeconds,
		ContributeEnabled: cfg.ContributeEnabled,
		AgentSetupURL:     cfg.AgentSetupURL,
		DiscordURL:        cfg.DiscordURL,
		MatrixURL:         cfg.MatrixURL,
	}, readings, logger, nil)
	if err := st.Hydrate(); err != nil {
		logger.Warn("failed to hydrate store from db", "err", err)
	}

	orch := orchestrator.New(provider.Current, cfg.GlobalCadence, cfg.BootstrapMinSeconds)

	authRepo, err := db.NewAuthRepo(conn)
	if err != nil {
		return err
	}
	sessionSecret := ""
	if cfg.Auth.SessionSecret != nil {
		sessionSecret = *cfg.Auth.SessionSecret
	} else {
		sessionSecret = token.Generate()
		logger.Warn("SESSION_SECRET not set; using an ephemeral secret (sessions reset on restart)")
	}
	if err := auth.SeedSettings(authRepo, cfg.Auth.RequireAuthInitial, cfg.Auth.EnableAPIKeys); err != nil {
		return err
	}
	var webAuthn *auth.WebAuthn
	if wa, werr := auth.NewWebAuthn(cfg.Auth.RPID, cfg.Auth.RPName, cfg.Auth.Origin); werr != nil {
		logger.Warn("passkeys disabled: could not configure WebAuthn", "err", werr)
	} else {
		webAuthn = wa
	}
	authService := auth.NewAuthService(authRepo, auth.Config{
		SessionSecret: sessionSecret, SessionTTLMs: cfg.Auth.SessionTTLMs, CookieSecure: cfg.Auth.CookieSecure,
		RPID: cfg.Auth.RPID, RPName: cfg.Auth.RPName, Origin: cfg.Auth.Origin,
	}, webAuthn)
	if b := cfg.Auth.AdminBootstrap; b != nil {
		if err := auth.SeedBootstrapAdmin(authRepo, auth.BootstrapAdmin{Username: b.Username, Password: b.Password, Email: b.Email, Name: b.Name}, logger); err != nil {
			return err
		}
	}

	server := httpapi.New(httpapi.Deps{
		Config:       cfg,
		Store:        st,
		Orchestrator: orch,
		Registry:     provider,
		Readings:     readings,
		Agents:       agents,
		Auth:         authService,
		AuthRepo:     authRepo,
		Presence:     presence.New(),
		Log:          logger,
		PublicDir:    config.PublicDir(),
	})

	if len(args) > 0 && args[0] == "openapi" {
		return printOpenAPI(server, args)
	}

	go pruneLoop(readings, cfg, logger)
	go sessionPruneLoop(authRepo, logger)

	addr := fmt.Sprintf(":%d", cfg.Port)
	logger.Info("hub listening", "addr", addr, "docs", "/docs")
	return http.ListenAndServe(addr, server.Router)
}

// pruneLoop deletes readings past the retention window, hourly.
func pruneLoop(readings *db.ReadingsRepo, cfg *config.Config, logger *slog.Logger) {
	retentionMs := int64(cfg.DataRetentionDays) * 24 * 60 * 60 * 1000
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		if removed, err := readings.Prune(retentionMs, time.Now()); err != nil {
			logger.Warn("prune failed", "err", err)
		} else if removed > 0 {
			logger.Info("pruned old readings", "removed", removed)
		}
	}
}

// sessionPruneLoop deletes expired sessions hourly.
func sessionPruneLoop(authRepo *db.AuthRepo, logger *slog.Logger) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		if _, err := authRepo.PruneSessions(); err != nil {
			logger.Warn("session prune failed", "err", err)
		}
		if _, err := authRepo.PruneTrustedDevices(); err != nil {
			logger.Warn("trusted-device prune failed", "err", err)
		}
	}
}

func printOpenAPI(server *httpapi.Server, args []string) error {
	format := "yaml"
	if len(args) > 1 {
		format = strings.ToLower(args[1])
	}
	var (
		out []byte
		err error
	)
	if format == "json" {
		out, err = server.API.OpenAPI().MarshalJSON()
	} else {
		out, err = server.API.OpenAPI().YAML()
	}
	if err != nil {
		return err
	}
	_, err = os.Stdout.Write(out)
	return err
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
