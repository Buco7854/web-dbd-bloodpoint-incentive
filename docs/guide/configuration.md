# Configuration

Everything is configured through environment variables (loaded from a single
`.env` in the Docker Compose setup). The hub can alternatively read its entire
config from a YAML file. See [Optional: YAML config](#optional-yaml-config).

Defaults below are the hub's built-in defaults. Empty cells mean there is no
default (the feature is off or the value is required).

## Common (both roles)

| Var | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `info` | Log verbosity. Applies to both the hub and agents. |
| `TZ` | `UTC` | Timezone. Applies to both the hub and agents. |
| `HUB_IMAGE` | `ghcr.io/buco7854/bloodpoint-incentives/hub:latest` | Hub image used by Compose. Override for a fork or pinned tag. |
| `AGENT_IMAGE` | `ghcr.io/buco7854/bloodpoint-incentives/agent:latest` | Agent image used by Compose. Override for a fork or pinned tag. |

## Hub

### Core

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port the hub listens on (clamped to 1–65535). |
| `STALE_AFTER_SECONDS` | `900` | A region's reading is shown as stale once older than this many seconds (minimum 60). |
| `PAGE_SIZE` | `20` | Paginate region lists above this count. |
| `DB_PATH` | `./data/bloodpoint.db` | SQLite database for readings + history. Persist it on a volume. |
| `DATA_RETENTION_DAYS` | `31` | Days of readings to keep before pruning (minimum 1, raise to e.g. `365`). |
| `FORECAST_WINDOW_DAYS` | `84` | Days of history the bonus forecast trains on, independent of retention (minimum 1). |
| `CONTACT_EMAIL` | – | Email shown on the contribute page and footer. |
| `CONTRIBUTE_ENABLED` | `false` | Show the "contribute data" page, banner, and nav. |
| `AGENT_SETUP_URL` | `https://docs.bpincentives.com/guide/running-an-agent` | Where the contribute page points for agent setup. |
| `DISCORD_URL` | – | Community link shown next to the contact email. |
| `MATRIX_URL` | – | Community link shown next to the contact email. |
| `TRUSTED_PROXIES` | `false` | Which upstreams may set the real client IP via `X-Forwarded-For` / `X-Real-IP` (used for the live viewer count). An IP/CIDR list, `true`/`false`, or a hop count. Untrusted callers can't spoof their IP. Behind a reverse proxy, set this or every viewer collapses to the proxy's IP. |
| `CORS_ALLOWED_ORIGINS` | – | Browser origins allowed to call the API cross-origin (comma-separated), e.g. `https://docs.bpincentives.com` for the docs site's interactive "Try it". Use `*` to allow any (without credentials). Unset means same-origin only. |
| `HUB_CONFIG` | – | Path to a YAML config carrying the full hub config (env overrides it). See below. |

### Cadence

| Var | Default | Purpose |
|---|---|---|
| `POLL_MIN_SECONDS` | `%refreshTime%` | Default minimum poll interval handed to agents. A number of seconds or a `%refreshTime%` expression. Floored at 300s. |
| `POLL_MAX_SECONDS` | ≈ `min × 1.33` | Default maximum poll interval. A number of seconds or a `%refreshTime%` expression. Defaults to the min times the default ratio if omitted. |

`%refreshTime%` (alias `%auto%`) resolves to Dead by Daylight's live refresh
cadence, learned from agent reports. Until a value is known, the hub uses a
300-second bootstrap interval. Expressions like `%refreshTime% * 1.33` are
allowed. See [How it works](./how-it-works#the-hub-owns-the-poll-cadence).

### Auth (see [Authentication](./authentication))

| Var | Default | Purpose |
|---|---|---|
| `SESSION_SECRET` | – | Signs session cookies. If unset, an ephemeral secret is generated and sessions reset on restart. |
| `ORIGIN` | `http://localhost:<PORT>` | Public origin. Required for WebAuthn passkeys. |
| `RP_ID` | ORIGIN's host | WebAuthn relying-party id (the passkey domain). |
| `RP_NAME` | `Bloodpoint Incentives` | WebAuthn relying-party display name, shown in the passkey prompt. |
| `COOKIE_SECURE` | `true` if ORIGIN is https | Mark session cookies `Secure`. |
| `SESSION_TTL_HOURS` | `168` | Session lifetime in hours (minimum 1). |
| `REQUIRE_AUTH` | `false` | Require a logged-in session (or API key) to view the whole site. |
| `ENABLE_API_KEYS` | `false` | Let users mint personal API keys that authenticate as their owner. See [API keys](./api-keys). |
| `ADMIN_BOOTSTRAP_USER` | – | Seed the first admin's username (else use the `/setup` page). |
| `ADMIN_BOOTSTRAP_PASSWORD` | – | Seed the first admin's password. Required if `ADMIN_BOOTSTRAP_USER` is set. |
| `ADMIN_BOOTSTRAP_EMAIL` | – | Optional email for the seeded admin. |
| `ADMIN_BOOTSTRAP_NAME` | – | Optional display name for the seeded admin. |

### Agent provisioning (hub side)

| Var | Default | Purpose |
|---|---|---|
| `PROVISION_AGENTS` | – | Register agents declaratively: comma-separated `<id>:<token>:<region>:<provider>` entries, upserted by `<id>` on boot. |
| `AGENTn_TOKEN` | – | Token for numbered agent `n`. Blank = skip provisioning (add it in the admin UI). Compose interpolates the same value into the agent container. |
| `AGENTn_REGION` | – | Region agent `n` covers, e.g. `eu-central-1`. |
| `AGENTn_PROVIDER` | – | Auth provider for agent `n` (decides the platform). `steam` today. |
| `AGENTn_ID` | `agent-n` | Stable provision id for agent `n` (used for upsert). |
| `AGENTn_LABEL` | – | Optional human label for agent `n`. |

Agents can also be registered at runtime in the admin UI, so none of the agent
env vars are strictly required at boot.

## Agent

| Var | Default | Purpose |
|---|---|---|
| `HUB_URL` | – (required) | Base URL of the hub to report to. Compose injects `http://hub:3000`. |
| `AGENT_KEY` | – (required) | The agent's token. The hub maps it to a region+platform. |
| `AUTH_PROVIDER` | `steam` | Provider the agent authenticates with (decides its platform). Only `steam` today. |
| `AGENT_HEALTH_PORT` | `3001` | Port for the minimal health endpoint (`0` disables it). |
| `STEAM_USERNAME` | – (required) | Steam account for headless login + depot discovery. Must own Dead by Daylight. |
| `STEAM_PASSWORD` | – (required) | Steam account password. |
| `STEAM_SHARED_SECRET` | – | Steam Guard shared secret (base64) for unattended 2FA. Strongly recommended for always-on agents. |
| `DBD_API_KEY` | – | Fallback (not recommended): a pre-obtained key for DBD auth, used only if the Steam login is rejected. The key expires and cannot self-refresh. |
| `VERSION_REFRESH_HOURS` | `6` | How often the agent re-resolves the latest build / client version. |
| `AGENT_MIN_POLL_SECONDS` | `%refreshTime%` | Accepted-range floor: refuse if the hub asks to poll faster. Seconds or a `%refreshTime%` expression. `off`/`none` disables it. |
| `AGENT_MAX_POLL_SECONDS` | `%refreshTime% * 1.33` | Accepted-range ceiling: refuse if the hub asks to poll slower. Seconds or a `%refreshTime%` expression. `off`/`none` disables it. |
| `STATE_DIR` | `./data` | Directory for the last-working-version state file. |

The poll cadence itself is set by the hub, not the agent. The agent only
enforces its accepted range. The client version and OS headers are not
configurable. The client version is discovered live and the OS header is fixed.

## Optional: YAML config

Point `HUB_CONFIG` at a YAML file to define the whole hub there: settings,
cadence, the `provision:` agent list, and an `auth:` block. See
`hub.example.yaml` in the repo. The file supports `${ENV}` interpolation
(including `${VAR:-default}`), and any matching environment variable overrides
the file, so the file is the baseline and env is the override. Keep secrets as
`${VAR}` so they live in the environment, not the file.

```yaml
port: 3000 # overridden by PORT if set
contactEmail: ${CONTACT_EMAIL:-}
poll: { min: "%refreshTime%", max: "%refreshTime% * 1.33" }
auth:
  origin: ${ORIGIN:-}
  sessionSecret: ${SESSION_SECRET:-}
  requireAuth: false
provision:
  - { id: eu-1, token: "${AGENT_EU_1_TOKEN}", region: eu-central-1, provider: steam }
  - { id: us-1, token: "${AGENT_US_1_TOKEN}", region: us-east-1, provider: steam }
```

## A note on quoting secrets

::: warning
Do not wrap values in quotes in env files. Some setups pass the quotes through
literally and corrupt the value. Surrounding quotes are stripped defensively, but
the cleaner habit is to leave them off.
:::
