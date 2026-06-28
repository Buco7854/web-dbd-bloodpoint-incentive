# Running an agent

This is the contributor guide. It is for people who want to feed an existing
hub they do not operate, by running a data agent for a region that needs
coverage. If instead you want to deploy your own hub, see
[Running the hub](./self-hosting), which owns agent provisioning and token
creation.

An agent polls a single region on a single platform and reports each reading to
a hub. It doesn't matter where you live, an agent can run anywhere, and it's
most useful to pick a region that has no coverage yet.

This page is the canonical agent setup guide (it's where a hub's contribute page
links via `AGENT_SETUP_URL`).

::: warning Each agent needs its own token and its own Steam account
Don't share a token or a Steam account between two running agents. Each agent
needs a dedicated Dead by Daylight account that owns the game.
:::

## 1. Get an agent token from the operator

The token is how the hub recognises your agent and maps it to a region and
platform. You don't pick it. Ask the hub's operator to add an agent for the
region you want to cover, and they'll send you the token the hub generates.

::: tip
Agents are upserted by a stable id, so the operator re-deploying, rotating your
token, or moving your region just updates the same agent rather than creating a
duplicate.
:::

## 2. Provide a dedicated Steam account

The agent logs into Steam to discover the live Dead by Daylight client build and
read incentives, so it needs a Steam account that owns Dead by Daylight.
Provide:

- `STEAM_USERNAME` and `STEAM_PASSWORD`, and
- `STEAM_SHARED_SECRET`, the Steam Guard shared secret (base64), for unattended
  two-factor login. Without it you'd have to enter a code by hand, which doesn't
  suit an always-on container.

::: tip Your Steam credentials stay on your machine
The agent's Steam credentials are never sent to the hub or to anyone else. They
are used only by the agent process, on the machine you run it on, to log into
Steam directly. They never leave that machine. The agent only ever sends the hub
its readings and its `refreshTime`, authenticated by its agent token.
:::

::: warning Only the `steam` provider is implemented
The provider decides the platform: a Steam agent reports `Windows`. `epic`
(EGS) and `grdk` (Microsoft Store) are recognised by the hub but not
implemented yet, so today every agent is a Steam agent.
:::

## 3. Configure the agent

The agent needs three things from you:

- `HUB_URL`: the base URL of the hub you're reporting to, e.g.
  `https://hub.example.com`.
- `AGENT_KEY`: the token the operator gave you.
- The `STEAM_*` credentials from step 2.

The operator decides which region and platform your token covers, so you don't
set those on the agent. The agent learns them from the hub on start.

## 4. Run the agent

### With plain `docker run`

Against a remote hub:

```bash
docker run --rm -v bp-data:/app/data \
  -e HUB_URL=https://hub.example.com \
  -e AGENT_KEY=your-token \
  -e STEAM_USERNAME=... -e STEAM_PASSWORD=... -e STEAM_SHARED_SECRET=... \
  ghcr.io/buco7854/bloodpoint-incentives/agent:latest
```

A `bp-data` volume (mounted at `/app/data`) persists the agent's small state file
(its last-known-good client version).

### With Docker Compose

If you prefer Compose for a standalone agent, define a single service pointing at
the remote hub:

```yaml
services:
  agent:
    image: ghcr.io/buco7854/bloodpoint-incentives/agent:latest
    restart: unless-stopped
    environment:
      HUB_URL: https://hub.example.com
      AGENT_KEY: ${AGENT_KEY}
      STEAM_USERNAME: ${STEAM_USERNAME}
      STEAM_PASSWORD: ${STEAM_PASSWORD}
      STEAM_SHARED_SECRET: ${STEAM_SHARED_SECRET}
    volumes:
      - agent-data:/app/data

volumes:
  agent-data:
```

```bash
docker compose up -d
```

## What the agent does once running

- On start it calls `GET /api/v1/agent/assignment` with its token and learns its
  region, platform, poll cadence, and a phase offset.
- It always tracks the latest live client build from the Steam depot (never
  version-pinned) and reports each real reading to `POST /api/v1/agent/readings`.
- It obeys the hub-assigned cadence, with a hard 300-second floor. The hub will
  never have it poll faster than once every five minutes. The agent can also
  declare its own accepted range with `AGENT_MIN_POLL_SECONDS` /
  `AGENT_MAX_POLL_SECONDS` and refuse, fatally, if the hub's cadence falls
  outside it.
- It refuses to start if its credentials disagree with the assigned platform.

On an unrecoverable error (bad Steam credentials, a not-entitled account) the
agent stops polling, logs off Steam, and its health endpoint returns 503 so the
container is marked unhealthy instead of restart-looping into Steam. Transient
errors back off and retry.

See [Configuration](./configuration) for every agent variable, and
[How it works](./how-it-works) for the cadence and spacing model.
