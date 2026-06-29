// Package config loads the hub's runtime configuration from the environment.
package config

import (
	"fmt"
	"math"
	"net/netip"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/buco7854/bloodpoint-incentives/internal/cadence"
	"github.com/buco7854/bloodpoint-incentives/internal/domain"
	"github.com/buco7854/bloodpoint-incentives/internal/registry"
)

// bootstrapMinSeconds is the interval used until a refreshTime expression resolves.
const bootstrapMinSeconds = 300

// AdminBootstrap is an admin seeded from env on first boot.
type AdminBootstrap struct {
	Username string
	Password string
	Email    *string
	Name     *string
}

// AuthConfig is the authentication/session configuration resolved from env.
type AuthConfig struct {
	SessionSecret      *string
	CookieSecure       bool
	SessionTTLMs       int64
	RPID               string
	RPName             string
	Origin             string
	RequireAuthInitial bool
	// EnableAPIKeys is the master switch for API-key authentication.
	EnableAPIKeys  bool
	AdminBootstrap *AdminBootstrap
}

// Config is the hub's resolved runtime configuration.
type Config struct {
	Port     int
	LogLevel string
	TZ       string

	Auth AuthConfig

	ContactEmail      *string
	ContributeEnabled bool
	SEOEnabled        bool
	AgentSetupURL     string
	DiscordURL        *string
	MatrixURL         *string

	PageSize          int
	StaleAfterSeconds int

	DBPath             string
	DataRetentionDays  int
	ForecastWindowDays int

	ProvisionAgents     []registry.ProvisionInput
	GlobalCadence       domain.CadenceSpec
	BootstrapMinSeconds int

	// TrustProxy decides whose X-Forwarded-For / X-Real-IP headers the hub honors
	// when resolving a client's IP. Zero value means trust none.
	TrustProxy ProxyTrust

	// CORSAllowedOrigins are browser origins allowed to call the API cross-origin
	// (e.g. the docs site's interactive "Try it"). "*" allows any (no credentials).
	CORSAllowedOrigins []string
}

// ProxyTrust is the parsed TRUSTED_PROXIES policy: trust every upstream, a fixed
// number of proxy hops, or only peers within specific networks.
type ProxyTrust struct {
	All   bool
	Hops  int
	CIDRs []netip.Prefix
}

// Load reads configuration from environment variables, applying defaults. When
// HUB_CONFIG points at a YAML file, its values seed the environment first (env
// still wins).
func Load() (*Config, error) {
	if err := applyHubConfigFile(); err != nil {
		return nil, err
	}
	auth, err := resolveAuth()
	if err != nil {
		return nil, err
	}
	provision, err := provisionAgents()
	if err != nil {
		return nil, err
	}
	cad, err := globalCadence()
	if err != nil {
		return nil, err
	}
	proxies, err := trustedProxies()
	if err != nil {
		return nil, err
	}
	return &Config{
		Port:     clamp(intOr("PORT", 3000), 1, 65535),
		LogLevel: strings.ToLower(stringOr("LOG_LEVEL", "info")),
		TZ:       stringOr("TZ", "UTC"),

		Auth: auth,

		ContactEmail:      strPtr("CONTACT_EMAIL"),
		ContributeEnabled: boolOr("CONTRIBUTE_ENABLED", false),
		SEOEnabled:        boolOr("SEO_ENABLED", false),
		AgentSetupURL:     stringOr("AGENT_SETUP_URL", "https://docs.bpincentives.com/guide/running-an-agent"),
		DiscordURL:        strPtr("DISCORD_URL"),
		MatrixURL:         strPtr("MATRIX_URL"),

		PageSize:          clamp(intOr("PAGE_SIZE", 20), 1, 0),
		StaleAfterSeconds: clamp(intOr("STALE_AFTER_SECONDS", 900), 60, 0),

		DBPath:             stringOr("DB_PATH", "./data/bloodpoint.db"),
		DataRetentionDays:  clamp(intOr("DATA_RETENTION_DAYS", 31), 1, 0),
		ForecastWindowDays: clamp(intOr("FORECAST_WINDOW_DAYS", 84), 1, 0),

		ProvisionAgents:     provision,
		GlobalCadence:       cad,
		BootstrapMinSeconds: bootstrapMinSeconds,
		TrustProxy:          proxies,
		CORSAllowedOrigins:  splitList(stringOr("CORS_ALLOWED_ORIGINS", "")),
	}, nil
}

// splitList parses a comma-separated env value into a trimmed, non-empty slice.
func splitList(raw string) []string {
	var out []string
	for _, tok := range strings.Split(raw, ",") {
		if tok = strings.TrimSpace(tok); tok != "" {
			out = append(out, tok)
		}
	}
	return out
}

// trustedProxies parses TRUSTED_PROXIES: "true"/"false" (trust all / none), an
// integer hop count, or a comma-separated list of CIDRs / bare IPs
// (e.g. "10.0.0.0/8, 127.0.0.1"). Unset or empty means trust none.
func trustedProxies() (ProxyTrust, error) {
	raw, ok := readString("TRUSTED_PROXIES")
	if !ok || strings.TrimSpace(raw) == "" {
		return ProxyTrust{}, nil
	}
	raw = strings.TrimSpace(raw)
	switch strings.ToLower(raw) {
	case "true":
		return ProxyTrust{All: true}, nil
	case "false":
		return ProxyTrust{}, nil
	}
	if n, err := strconv.Atoi(raw); err == nil {
		if n < 0 {
			return ProxyTrust{}, configErrorf("TRUSTED_PROXIES: hop count must be >= 0")
		}
		return ProxyTrust{Hops: n}, nil
	}
	var cidrs []netip.Prefix
	for _, tok := range strings.Split(raw, ",") {
		tok = strings.TrimSpace(tok)
		if tok == "" {
			continue
		}
		if strings.Contains(tok, "/") {
			p, err := netip.ParsePrefix(tok)
			if err != nil {
				return ProxyTrust{}, configErrorf("TRUSTED_PROXIES: invalid CIDR %q: %v", tok, err)
			}
			cidrs = append(cidrs, p.Masked())
			continue
		}
		a, err := netip.ParseAddr(tok)
		if err != nil {
			return ProxyTrust{}, configErrorf("TRUSTED_PROXIES: invalid IP %q: %v", tok, err)
		}
		cidrs = append(cidrs, netip.PrefixFrom(a, a.BitLen()))
	}
	return ProxyTrust{CIDRs: cidrs}, nil
}

// PublicDir is the directory of built SPA assets the hub serves (env PUBLIC_DIR).
func PublicDir() string {
	return stringOr("PUBLIC_DIR", "dist/public")
}

// strPtr returns a pointer to the env value, or nil when unset/empty.
func strPtr(name string) *string {
	if v, ok := readString(name); ok {
		return &v
	}
	return nil
}

func resolveAuth() (AuthConfig, error) {
	origin := strings.TrimRight(stringOr("ORIGIN", ""), "/")
	if origin == "" {
		origin = fmt.Sprintf("http://localhost:%d", intOr("PORT", 3000))
	}
	rpID := stringOr("RP_ID", "")
	if rpID == "" {
		rpID = hostOf(origin)
	}
	cookieSecure := boolOr("COOKIE_SECURE", strings.HasPrefix(origin, "https://"))
	ttlHours := clamp(intOr("SESSION_TTL_HOURS", 168), 1, 0)

	// A short or placeholder SESSION_SECRET is trivially brute-forceable and would let
	// an attacker forge session cookies, so reject it outright rather than booting
	// insecurely. (An unset secret is fine: main.go generates a strong ephemeral one.)
	if secret, ok := readString("SESSION_SECRET"); ok {
		if secret == "change-me-to-a-long-random-string" {
			return AuthConfig{}, configErrorf("SESSION_SECRET is still the example placeholder; set it to a long random string (e.g. `openssl rand -base64 32`)")
		}
		if len(secret) < 16 {
			return AuthConfig{}, configErrorf("SESSION_SECRET is too short (%d chars); use at least 16 (e.g. `openssl rand -base64 32`)", len(secret))
		}
	}

	var bootstrap *AdminBootstrap
	user, hasUser := readString("ADMIN_BOOTSTRAP_USER")
	pass, hasPass := readString("ADMIN_BOOTSTRAP_PASSWORD")
	if hasUser && !hasPass {
		return AuthConfig{}, configErrorf("ADMIN_BOOTSTRAP_USER is set but ADMIN_BOOTSTRAP_PASSWORD is missing")
	}
	if hasUser && hasPass {
		bootstrap = &AdminBootstrap{Username: user, Password: pass, Email: strPtr("ADMIN_BOOTSTRAP_EMAIL"), Name: strPtr("ADMIN_BOOTSTRAP_NAME")}
	}

	return AuthConfig{
		SessionSecret:      strPtr("SESSION_SECRET"),
		CookieSecure:       cookieSecure,
		SessionTTLMs:       int64(ttlHours) * 60 * 60 * 1000,
		RPID:               rpID,
		RPName:             stringOr("RP_NAME", "Bloodpoint Incentives"),
		Origin:             origin,
		RequireAuthInitial: boolOr("REQUIRE_AUTH", false),
		EnableAPIKeys:      boolOr("ENABLE_API_KEYS", false),
		AdminBootstrap:     bootstrap,
	}, nil
}

func hostOf(origin string) string {
	s := origin
	if i := strings.Index(s, "://"); i >= 0 {
		s = s[i+3:]
	}
	if i := strings.IndexAny(s, ":/"); i >= 0 {
		s = s[:i]
	}
	if s == "" {
		return "localhost"
	}
	return s
}

// globalCadence resolves the default cadence, env over defaults; max defaults to min*ratio.
func globalCadence() (domain.CadenceSpec, error) {
	min := stringOr("POLL_MIN_SECONDS", "300")
	if _, _, err := cadence.ResolveCadence(min, ptrF(300)); err != nil {
		return domain.CadenceSpec{}, configErrorf("POLL_MIN_SECONDS: %v", err)
	}
	max, ok := readString("POLL_MAX_SECONDS")
	if !ok {
		max = defaultMaxFor(min)
	} else if _, _, err := cadence.ResolveCadence(max, ptrF(300)); err != nil {
		return domain.CadenceSpec{}, configErrorf("POLL_MAX_SECONDS: %v", err)
	}
	return domain.CadenceSpec{Min: min, Max: max}, nil
}

func ptrF(f float64) *float64 { return &f }

// defaultMaxFor returns min*ratio, numeric when min is numeric, else an expression.
func defaultMaxFor(min string) string {
	if n, err := strconv.ParseFloat(min, 64); err == nil {
		return strconv.Itoa(int(math.Round(n * cadence.DefaultMaxRatio)))
	}
	return fmt.Sprintf("(%s) * %g", min, cadence.DefaultMaxRatio)
}

var agentTokenRe = regexp.MustCompile(`^AGENT(\d+)_TOKEN$`)

// provisionAgents collects the boot manifest from PROVISION_AGENTS and AGENTn_* env vars.
func provisionAgents() ([]registry.ProvisionInput, error) {
	out, err := registry.ParseProvisionAgents(stringOr("PROVISION_AGENTS", ""))
	if err != nil {
		return nil, err
	}
	return append(numberedAgents(), out...), nil
}

// numberedAgents reads AGENTn_* declarations (the ones compose interpolates per agent).
func numberedAgents() []registry.ProvisionInput {
	var nums []int
	for _, kv := range os.Environ() {
		key := kv[:strings.IndexByte(kv, '=')]
		if m := agentTokenRe.FindStringSubmatch(key); m != nil {
			n, _ := strconv.Atoi(m[1])
			nums = append(nums, n)
		}
	}
	sort.Ints(nums)
	var out []registry.ProvisionInput
	for _, n := range nums {
		token, ok := readString(fmt.Sprintf("AGENT%d_TOKEN", n))
		if !ok {
			continue // blank = managed in the admin UI instead
		}
		id := stringOr(fmt.Sprintf("AGENT%d_ID", n), fmt.Sprintf("agent-%d", n))
		out = append(out, registry.ProvisionInput{
			ProvisionID: id,
			Token:       token,
			Region:      stringOr(fmt.Sprintf("AGENT%d_REGION", n), ""),
			Provider:    stringOr(fmt.Sprintf("AGENT%d_PROVIDER", n), ""),
			Label:       strPtr(fmt.Sprintf("AGENT%d_LABEL", n)),
		})
	}
	return out
}
