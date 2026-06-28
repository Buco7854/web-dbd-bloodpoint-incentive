# Running the hub

This is the operator guide. It is for people who deploy and run the hub (and
usually their own agents too). If instead you only want to contribute coverage by
feeding someone else's hub, see [Running an agent](./running-an-agent).

The hub is the only piece the browser talks to: it aggregates readings, persists
history, serves the React dashboard, the REST API, the interactive API docs, and
the live stream. This page walks through running it with Docker Compose and owns
how you register and provision agents.

## Prerequisites

- Docker with the Compose plugin.
- At least one agent token + Steam account if you want live data right away (you
  can also add agents later from the admin UI). You create the tokens yourself,
  see [Provisioning agents](#provisioning-agents) below.

## Images

The hub and agent are separate images, both published to GHCR:

- Hub: `ghcr.io/buco7854/bloodpoint-incentives/hub:latest`
- Agent: `ghcr.io/buco7854/bloodpoint-incentives/agent:latest`

Compose pulls these by default. You can override them with `HUB_IMAGE` /
`AGENT_IMAGE` in your `.env` (for a fork or a pinned tag). The hub image is the
static Go binary that serves the SPA. The agent image is the Node runtime with
the Steam libraries.

## Walkthrough

A single `.env` file drives everything. Copy the example and edit it:

```bash
cp .env.example .env
```

The shipped `docker-compose.yml` defines a `hub` service, a `hub-data` volume,
and one agent service (`agent-1`):

```yaml
services:
  hub:
    image: ${HUB_IMAGE:-ghcr.io/buco7854/bloodpoint-incentives/hub:latest}
    container_name: bloodpoint-hub
    restart: unless-stopped
    ports:
      - '${PORT:-3000}:${PORT:-3000}'
    env_file: .env
    volumes:
      - hub-data:/app/data
      # - ./hub.yaml:/config/hub.yaml:ro

volumes:
  hub-data:
  agent-1-data:
```

A few things to note:

- `env_file: .env`: every variable in your `.env` reaches the hub container.
  This is also where compose reads the `AGENTn_*` variables and interpolates the
  same `${AGENT1_TOKEN}` into both the hub's `PROVISION_AGENTS` and the agent
  container, so each token is declared once.
- `hub-data:/app/data`: the SQLite database (`DB_PATH`, default
  `./data/bloodpoint.db`) lives here. Keep it on a volume so your readings and
  history persist across restarts and upgrades.
- The commented `./hub.yaml:/config/hub.yaml:ro` mount is for the optional YAML
  config (see below).

Bring it up:

```bash
docker compose up -d   # pulls the published hub + agent images
```

The hub comes up on `http://localhost:3000`. It serves the SPA at `/`, the
interactive API docs at `/docs`, and the OpenAPI spec at `/openapi.json`.

## First run: creating the first admin

On first run the hub has no admin account. There are two ways to create one:

1. The `/setup` page: open `http://localhost:3000/setup` and create the first
   admin interactively. This page only works while there is no admin yet.
2. Bootstrap from env: set `ADMIN_BOOTSTRAP_USER` and `ADMIN_BOOTSTRAP_PASSWORD`
   (optionally `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_NAME`) before first
   boot to seed the admin without the setup page.

::: tip
If MFA is enforced for admins (the default), the first admin enrolls a second
factor on first login. See [Authentication](./authentication).
:::

## Provisioning agents

You, the operator, own agent tokens. A token is any opaque secret you choose, so
generate a strong random one, e.g.:

```bash
openssl rand -base64 24
```

Each token maps an agent to a region and platform. There are three ways to
register agents, all of which upsert by a stable id (re-deploys never duplicate,
and rotating a token or moving a region just updates the same agent):

- Admin UI (recommended for ad-hoc). On your hub, open the admin UI, choose Add
  agent, and pick a region. The token is shown once, copy it then.
- `PROVISION_AGENTS`: a compact string of `<id>:<token>:<region>:<provider>`
  entries, comma-separated, registered on boot. You pick each token.
  ```
  PROVISION_AGENTS=eu:tok-a:eu-central-1:steam,us1:tok-b:us-east-1:steam
  ```
- Numbered `AGENTn_*` env vars (what Docker Compose uses). Set `AGENT1_TOKEN`
  and `AGENT1_REGION` (optionally `AGENT1_PROVIDER`, `AGENT1_ID`,
  `AGENT1_LABEL`) and the hub provisions `agent-1` from them. These are the same
  variables the agent container reads, so a token is declared once.

Agents can also be registered at runtime in the admin UI, so none of the agent
env vars are strictly required at boot.

### Running agents alongside the hub

The shipped `docker-compose.yml` already includes an `agent-1` service built from
an `x-agent` anchor. Fill in the per-agent values in `.env`:

```bash
AGENT1_TOKEN=your-token
AGENT1_REGION=eu-central-1
AGENT1_PROVIDER=steam
AGENT1_STEAM_USERNAME=...
AGENT1_STEAM_PASSWORD=...
AGENT1_STEAM_SHARED_SECRET=...
```

The compose service maps those into the agent container:

```yaml
agent-1:
  <<: *agent
  container_name: bloodpoint-agent-1
  environment:
    <<: *agent-env
    AGENT_KEY: ${AGENT1_TOKEN}
    STEAM_USERNAME: ${AGENT1_STEAM_USERNAME:-}
    STEAM_PASSWORD: ${AGENT1_STEAM_PASSWORD:-}
    STEAM_SHARED_SECRET: ${AGENT1_STEAM_SHARED_SECRET:-}
  volumes:
    - agent-1-data:/app/data
```

The agent's `HUB_URL` defaults to `http://hub:3000` (the in-compose hub).

To add another agent, fill in the `AGENT2_*` variables in `.env` and uncomment
the `agent-2` service block (and its `agent-2-data` volume) in
`docker-compose.yml`. The hub provisions it automatically.

For what an agent actually does once running (cadence, the 300-second floor,
client-version tracking), and for handing tokens to outside contributors, see
[Running an agent](./running-an-agent).

## Gating the site

By default the dashboard and read API are public. To require a logged-in session
to view the whole site, set:

```bash
REQUIRE_AUTH=true
```

The `/healthz` endpoint and the `/api/v1/agent/*` ingest routes (which use
per-agent token auth) stay exempt. When the gate is on, read endpoints accept a
session or an [API key](./api-keys).

## Optional: full config in YAML

Instead of a long `.env`, you can point `HUB_CONFIG` at a YAML file carrying the
entire hub config: settings, cadence, the `provision:` agent list, and an
`auth:` block. See `hub.example.yaml` in the repo. The file supports `${ENV}`
interpolation, and any matching environment variable overrides the file (so the
file is the baseline and env is the override). Keep secrets as `${VAR}` so they
stay in the environment, not in the file.

Uncomment the volume mount and set `HUB_CONFIG`:

```yaml
volumes:
  - hub-data:/app/data
  - ./hub.yaml:/config/hub.yaml:ro
```

```bash
HUB_CONFIG=/config/hub.yaml
```

## Building the images yourself

The repo's Dockerfile has a `hub` and an `agent` target:

```bash
docker build --target hub   -t bp-hub   .
docker build --target agent -t bp-agent .
```

## Next steps

- [Running an agent](./running-an-agent): agent behavior, and tokens for outside
  contributors.
- [Configuration](./configuration): every environment variable explained.
- [Authentication](./authentication): accounts, second factors, the gate.
