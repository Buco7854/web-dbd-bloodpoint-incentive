# Getting started

Bloodpoint Incentives is a small, self-hostable web app that shows the live
bloodpoint incentives for _Dead by Daylight_ matchmaking servers: the bonus
awarded for playing the under-populated role, broken down per region and per
platform.

It is a fan project that reads Dead by Daylight's private matchmaking API with a
real game account and republishes the result through its own cache-only API, so
public traffic is fully decoupled from Behaviour's servers.

::: warning Unofficial fan project
This is not affiliated with or endorsed by Behaviour Interactive. Agents talk to
Dead by Daylight's private API using a real game account, so they are
deliberately gentle with it. Use at your own risk.
:::

## Which guide do I need?

There are three ways to use this project. Pick the one that matches you:

- I just want to see the incentives. Nothing to install. Open the hosted app at
  <https://bpincentives.com>. That's it. The rest of these guides are for
  running the software yourself.
- I want to contribute coverage for a region. You run a data agent that feeds an
  existing hub you do not operate. The hub's operator gives you a token, you
  provide a dedicated Steam account, and you run the agent container. See
  [Running an agent](./running-an-agent).
- I want to host my own hub. You deploy the hub (and usually your own agents)
  with Docker Compose, choose your own agent tokens, and own first-run setup,
  volumes, and configuration. See [Running the hub](./self-hosting).

## The two pieces

The system is made of two roles that you run yourself:

- The hub, a single Go service. It owns the registry of agents (which token
  covers which region+platform), aggregates incoming readings (keeping the most
  recent per region+platform), persists history to SQLite, and serves the React
  dashboard, the REST API, and the live stream. The browser only ever talks to
  the hub.
- Agents, one or more Node processes. Each agent polls a single region on a
  single platform, learns its assignment from the hub using its token, and
  reports each reading back to the hub. Several agents can cover the same target
  redundantly. The hub keeps whichever reported most recently.

```
  agent (eu-central-1, Windows) ─┐
  agent (us-east-1,    Windows) ─┼──>  hub  ──>  browser (SPA, live via SSE)
  agent (us-east-1,    Windows) ─┘     │
        redundant, same coverage       └─ REST API + OpenAPI docs
```

Under the hood the hub is a Go service (Go 1.25, the [Huma](https://huma.rocks/)
framework over chi, pure-Go SQLite via `modernc`), and agents are Node processes
that log into Steam to discover the live client build and read incentives.

## The quickest path to a running hub

The fastest way to stand everything up is Docker Compose. It pulls the published
hub and agent images and wires them together from a single `.env` file:

```bash
cp .env.example .env   # one file drives everything
# Fill in AGENT1_TOKEN + AGENT1_STEAM_USERNAME/PASSWORD (+ SHARED_SECRET) and AGENT1_REGION
docker compose up -d
```

This brings the hub up on `http://localhost:3000` along with one agent that
reports to it. On first run the hub has no admin yet, so it shows a `/setup`
page to create one.

For the full walkthrough (the compose file, volumes, environment, the first-run
admin, and provisioning agents) see [Running the hub](./self-hosting).

## Where things live

- The live app is at <https://bpincentives.com>.
- The interactive API reference is the [API Reference](/operations/), generated
  from the hub's OpenAPI 3.1 spec. Your own hub also serves the same interactive
  docs at `/docs` and the raw spec at `/openapi.json`.

## Next steps

- [How it works](./how-it-works): the aggregation model, hub-owned cadence,
  persistence, and live updates.
- [Running the hub](./self-hosting): deploy the hub with Docker Compose and
  provision agents.
- [Running an agent](./running-an-agent): contribute coverage for a region.
- [Configuration](./configuration): every environment variable, grouped and
  explained.
- [Authentication](./authentication) and [API keys](./api-keys): accounts,
  second factors, the optional site gate, and programmatic access.
- [Using the API](./api) and the [Forecasting model](./forecasting).
