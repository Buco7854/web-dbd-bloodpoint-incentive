package config

import (
	"os"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// hubFile mirrors hub.example.yaml. Every field is optional; a present value
// seeds the matching env var unless that env var is already set (env wins).
type hubFile struct {
	LogLevel           *string  `yaml:"logLevel"`
	TZ                 *string  `yaml:"tz"`
	Port               *int     `yaml:"port"`
	ContactEmail       *string  `yaml:"contactEmail"`
	TrustedProxies     *string  `yaml:"trustedProxies"`
	PageSize           *int     `yaml:"pageSize"`
	StaleAfterSeconds  *int     `yaml:"staleAfterSeconds"`
	DBPath             *string  `yaml:"dbPath"`
	DataRetentionDays  *int     `yaml:"dataRetentionDays"`
	ForecastWindowDays *int     `yaml:"forecastWindowDays"`
	ContributeEnabled  *bool    `yaml:"contributeEnabled"`
	EnableAPIKeys      *bool    `yaml:"enableApiKeys"`
	AgentSetupURL      *string  `yaml:"agentSetupUrl"`
	DiscordURL         *string  `yaml:"discordUrl"`
	MatrixURL          *string  `yaml:"matrixUrl"`
	CORSAllowedOrigins []string `yaml:"corsAllowedOrigins"`

	Auth *struct {
		SessionSecret   *string `yaml:"sessionSecret"`
		Origin          *string `yaml:"origin"`
		RPID            *string `yaml:"rpId"`
		RPName          *string `yaml:"rpName"`
		CookieSecure    *bool   `yaml:"cookieSecure"`
		SessionTTLHours *int    `yaml:"sessionTtlHours"`
		RequireAuth     *bool   `yaml:"requireAuth"`
		EnableAPIKeys   *bool   `yaml:"enableApiKeys"`
		Bootstrap       *struct {
			Username *string `yaml:"username"`
			Password *string `yaml:"password"`
			Email    *string `yaml:"email"`
			Name     *string `yaml:"name"`
		} `yaml:"bootstrap"`
	} `yaml:"auth"`

	Poll *struct {
		Min *string `yaml:"min"`
		Max *string `yaml:"max"`
	} `yaml:"poll"`

	Provision []struct {
		ID       string `yaml:"id"`
		Token    string `yaml:"token"`
		Region   string `yaml:"region"`
		Provider string `yaml:"provider"`
	} `yaml:"provision"`
}

var envRefRe = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}`)

// applyHubConfigFile reads HUB_CONFIG (if set), interpolates ${VAR} / ${VAR:-default}
// references against the environment, and seeds env vars from the file so the rest
// of Load() can read a single source. Env vars already set take precedence.
func applyHubConfigFile() error {
	path, ok := readString("HUB_CONFIG")
	if !ok {
		return nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return configErrorf("HUB_CONFIG: %v", err)
	}
	interpolated := envRefRe.ReplaceAllStringFunc(string(raw), func(m string) string {
		sub := envRefRe.FindStringSubmatch(m)
		if v, ok := os.LookupEnv(sub[1]); ok {
			return v
		}
		return sub[2] // default after ":-" (empty when absent)
	})

	var f hubFile
	if err := yaml.Unmarshal([]byte(interpolated), &f); err != nil {
		return configErrorf("HUB_CONFIG: %v", err)
	}

	setStr("LOG_LEVEL", f.LogLevel)
	setStr("TZ", f.TZ)
	setInt("PORT", f.Port)
	setStr("CONTACT_EMAIL", f.ContactEmail)
	setStr("TRUSTED_PROXIES", f.TrustedProxies)
	setInt("PAGE_SIZE", f.PageSize)
	setInt("STALE_AFTER_SECONDS", f.StaleAfterSeconds)
	setStr("DB_PATH", f.DBPath)
	setInt("DATA_RETENTION_DAYS", f.DataRetentionDays)
	setInt("FORECAST_WINDOW_DAYS", f.ForecastWindowDays)
	setBool("CONTRIBUTE_ENABLED", f.ContributeEnabled)
	setBool("ENABLE_API_KEYS", f.EnableAPIKeys)
	setStr("AGENT_SETUP_URL", f.AgentSetupURL)
	setStr("DISCORD_URL", f.DiscordURL)
	setStr("MATRIX_URL", f.MatrixURL)
	if len(f.CORSAllowedOrigins) > 0 {
		setDefault("CORS_ALLOWED_ORIGINS", strings.Join(f.CORSAllowedOrigins, ","))
	}

	if a := f.Auth; a != nil {
		setStr("SESSION_SECRET", a.SessionSecret)
		setStr("ORIGIN", a.Origin)
		setStr("RP_ID", a.RPID)
		setStr("RP_NAME", a.RPName)
		setBool("COOKIE_SECURE", a.CookieSecure)
		setInt("SESSION_TTL_HOURS", a.SessionTTLHours)
		setBool("REQUIRE_AUTH", a.RequireAuth)
		setBool("ENABLE_API_KEYS", a.EnableAPIKeys)
		if b := a.Bootstrap; b != nil {
			setStr("ADMIN_BOOTSTRAP_USER", b.Username)
			setStr("ADMIN_BOOTSTRAP_PASSWORD", b.Password)
			setStr("ADMIN_BOOTSTRAP_EMAIL", b.Email)
			setStr("ADMIN_BOOTSTRAP_NAME", b.Name)
		}
	}

	if p := f.Poll; p != nil {
		setStr("POLL_MIN_SECONDS", p.Min)
		setStr("POLL_MAX_SECONDS", p.Max)
	}

	if len(f.Provision) > 0 {
		var specs []string
		for _, a := range f.Provision {
			if strings.TrimSpace(a.Token) == "" {
				continue // blank token = manage in the admin UI instead
			}
			specs = append(specs, strings.Join([]string{a.ID, a.Token, a.Region, a.Provider}, ":"))
		}
		if len(specs) > 0 {
			setStr("PROVISION_AGENTS", strPtrOf(strings.Join(specs, ",")))
		}
	}
	return nil
}

// setDefault sets name from the file only when the env var isn't already set.
func setDefault(name, val string) {
	if _, ok := os.LookupEnv(name); ok {
		return
	}
	_ = os.Setenv(name, val)
}

func setStr(name string, v *string) {
	if v != nil && strings.TrimSpace(*v) != "" {
		setDefault(name, *v)
	}
}

func setInt(name string, v *int) {
	if v != nil {
		setDefault(name, strconv.Itoa(*v))
	}
}

func setBool(name string, v *bool) {
	if v != nil {
		setDefault(name, strconv.FormatBool(*v))
	}
}

func strPtrOf(s string) *string { return &s }
