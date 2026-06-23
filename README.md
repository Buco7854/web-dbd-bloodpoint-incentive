# Bloodpoint Incentive

A small, self-contained web app that shows the **live Bloodpoint incentive** for
_Dead by Daylight_ matchmaking servers: the bonus percentage awarded for playing
the under-populated role, per region, with a dark, DBD-themed, fully responsive UI.

One background poller maintains a server-side cache, and the browser only ever
reads that cache. Public traffic is fully decoupled from Behaviour's API.

> **Unofficial fan project.** Not affiliated with or endorsed by Behaviour
> Interactive. It talks to DBD's private API using a real game account, so it is
> deliberately gentle with it (see [API hygiene](#api-hygiene)). Use at your own risk.

---

## Features

- **All 15 regions** with display names and flags, or a single forced region.
- Each region shows **both roles in both formats**: `+75%` and `×1.75`, for
  survivor and killer, always, even when one side is zero.
- A headline number, a killer-vs-survivor **queue-balance bar**, and a warm to
  hot colour ramp as the bonus climbs.
- Two layouts: a **responsive card grid** and a focused **single-server hero**.
- Search, quick filters (survivor / killer / has bonus), sorting, and pagination.
- Honest freshness: "updated Xs ago", per-region **stale** badges, and a clear
  status banner when data is degraded or polling is backing off.
- **Never shows the fallback as real.** A response counts only when `ratio !== 0`.
- **Automatic version tracking.** The incentive `category` is derived from the
  latest live client build and re-checked periodically, with a cosmetic-patch
  guard that falls back to the last working build.
- Two independent auth layers: DBD API auth (Steam / quick key) and optional
  site access (for Authentik).
- Single multi-stage Docker image, non-root, healthcheck, graceful shutdown.

---

## Quick start

### Quick mode (works day one)

You need a pre-obtained DBD session key and the matching full client version
string. The app polls and serves immediately.

```bash
docker run --rm -p 3000:3000 \
  -e DBD_API_KEY="<your-dbd-session-key>" \
  -e DBD_GAME_VERSION="DBD_Sushi_REL_Steam_Shipping_9_3420587" \
  ghcr.io/buco7854/web-dbd-bloodpoint-incentive:latest   # published by CI, or build locally
```

Then open <http://localhost:3000>. The session key expires; for unattended
deployments use full Steam mode.

### Full Steam mode (preferred, unattended)

Headless Steam login obtains and refreshes the key automatically and discovers
the latest build from the Steam depot (no `DBD_GAME_VERSION` needed). The account
must own DBD.

```bash
cp .env.example .env
# set STEAM_USERNAME / STEAM_PASSWORD / STEAM_SHARED_SECRET, leave DBD_GAME_VERSION=auto
docker compose up -d --build
```

### Build the image yourself

```bash
docker build -t dbd-bloodpoint-incentive .
docker run --rm -p 3000:3000 --env-file .env -v bp-data:/app/data dbd-bloodpoint-incentive
```

### Local development

```bash
npm install
npm run dev          # Vite (UI) on :5173 proxying the API to the server on :3000
# in another shell, or just rely on the concurrently-run server
```

`npm run build` produces the SPA in `dist/public` and the server bundle in
`dist/server`. `npm start` runs the production server. `npm test` runs the unit
tests, `npm run typecheck` checks both TS projects.

---

## Authentication

There are **two independent layers**; do not confuse them.

### 1. DBD API auth (how the server obtains a key)

Pluggable `AuthProvider` interface with auto-refresh on `401`:

- **Quick mode** (`DBD_API_KEY`): use the key as-is. No refresh, no depot
  discovery, so `DBD_GAME_VERSION` is required.
- **Full Steam mode** (`STEAM_USERNAME` / `STEAM_PASSWORD` / `STEAM_SHARED_SECRET`):
  headless login via `steam-user`, exchange for a DBD api-key, re-login on `401`,
  and discover the latest build from the depot. On a randomized 4-6h timer the
  whole session is cycled like a game relaunch: the Steam connection AND the DBD
  api-key are dropped and re-established lazily on the next poll (a normal client
  does not stay connected forever). A captured refresh token keeps the Steam
  reconnect from re-prompting Steam Guard.
- **Epic** (`AUTH_PROVIDER=epic`): a wired `NotImplemented` stub, designed so
  adding it later is an isolated change.

> Note on full Steam mode: `steam-user` v5 does not expose
> `GetAuthTicketForWebApi(identity)`, so the web ticket cannot be bound to the
> `KRAKEN_DBD` identity from Node alone. The closest primitive
> (`createAuthSessionTicket`) is used; quick mode is the validated path meanwhile.

### 2. Site access (so it can sit behind Authentik)

Set `ACCESS_API_KEY` and every route **except `/healthz`** requires it, via the
`ACCESS_API_KEY_HEADER` header (default `X-API-Key`) or `Authorization: Bearer <key>`.
Leave it unset to run open behind a trusted proxy.

---

## How version auto-update works

The incentive pool is keyed per client build, so a stale `category` silently
returns the fallback. In full Steam mode the app:

1. Reads the latest public-branch build from the Steam depot
   (`DeadByDaylightVersionNumber.txt`), e.g. `DBD_Sushi_REL_Steam_Shipping_9_3420587`.
2. Derives the category: `sushi-rel-3420587-live`.
3. Re-resolves every `VERSION_REFRESH_HOURS` (and at startup), so a patch is
   picked up with no redeploy.
4. **Cosmetic-patch guard:** sometimes a build bump is cosmetic and matchmaking
   keeps the previous build's category. If the freshly derived category returns
   only fallbacks, the app reverts to the last category that returned real data
   (persisted in `STATE_DIR`) and waits for a newer build before trying again.

To pin a version (and disable discovery), set `DBD_GAME_VERSION` to a full
version string. This is required in quick mode. In full Steam mode you set no
version variables at all; `DBD_CLIENT_VERSION` and `DBD_CLIENT_OS` are optional
request headers with sensible defaults.

---

## Configuration

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ACCESS_API_KEY` | – | If set, required on all routes except `/healthz` |
| `ACCESS_API_KEY_HEADER` | `X-API-Key` | Header to check (Bearer also accepted) |
| `AUTH_PROVIDER` | `steam` | `steam` (now) or `epic` (stub) |
| `DBD_API_KEY` | – | Pre-obtained DBD session key (quick mode). If set, skips Steam login |
| `STEAM_USERNAME` / `STEAM_PASSWORD` / `STEAM_SHARED_SECRET` | – | Full-mode headless Steam login |
| `DBD_PLATFORM` | `Windows` | Body `platform`: `Windows` / `EGS` / `GRDK` |
| `DBD_GAME_VERSION` | `auto` | Override/seed for category + UA. Required in quick mode |
| `VERSION_REFRESH_HOURS` | `6` | How often to re-resolve the latest build |
| `DBD_CLIENT_VERSION` | `10.0.0` | `x-kraken-client-version` |
| `DBD_CLIENT_OS` | `10.0.26100.1.768.64bit` | `x-kraken-client-os` + User-Agent OS segment |
| `FORCE_REGION` | – | If set (e.g. `eu-central-1`), poll/show only this region |
| `POLL_INTERVAL_SECONDS` | `600` | Full-set refresh interval (clamped to >= 300) |
| `REQUEST_MIN_SPACING_MS` | `3000` | Minimum gap between any two BHVR calls |
| `UI_REFRESH_SECONDS` | `60` | How often the browser re-reads the cache |
| `PAGE_SIZE` | `12` | Paginate above this count |
| `STATE_DIR` | `./data` | Directory for the last-working-category file |
| `LOG_LEVEL` | `info` | pino log level |
| `TZ` | `UTC` | Timezone |

### Secrets with special characters

Do not wrap values in quotes in env files; some setups (for example
`docker run --env-file`) pass the quotes through literally and corrupt the value.
Surrounding quotes are stripped defensively, but the cleaner habit is to leave
them off. If a secret contains `$` and you use docker compose `env_file`, it may
be interpolated, so escape it as `$$`.

---

## Behind Authentik

The intended deployment is Authentik as a reverse-proxy / forward-auth in front
for browser SSO, with `ACCESS_API_KEY` as an optional second layer for
programmatic access. `/healthz` is always unauthenticated for the Docker
healthcheck.

A typical Authentik **Proxy Provider** pointed at `http://bloodpoint-incentive:3000`:

- **External host:** `https://bloodpoint.example.com`
- **Forward auth** (or full proxy) handles browser sign-in upstream.
- **Unauthenticated paths:** add `/healthz` so probes are never challenged.
- Optionally also set `ACCESS_API_KEY` on the container and have API clients send
  `X-API-Key: <key>` (or `Authorization: Bearer <key>`) for direct, non-SSO access.

```yaml
# docker-compose excerpt: app on an internal network, Authentik in front.
services:
  bloodpoint-incentive:
    image: dbd-bloodpoint-incentive
    env_file: [.env]            # optionally includes ACCESS_API_KEY
    expose: ['3000']            # not published; only Authentik reaches it
    networks: [edge]
# ... your existing Authentik server + outpost on the same `edge` network ...
```

---

## API

- `GET /healthz` (always open): `{ status, uptimeSeconds, cacheAgeSeconds, pollerStatus, regionsCached }`.
- `GET /api/incentives` (cache only): `{ updatedAt, platform, version, category, status, regions: [...] }`.
  Each region: `{ region, displayName, flag, survivor, killer, ratio, isReal, stale, lastUpdated }`.

The browser polls `/api/incentives`; the refresh button re-reads the cache. No
route ever proxies straight to Behaviour.

## API hygiene

The account is real and can be actioned, so the poller behaves like a single
normal player:

- One client identity, one long-lived session, re-auth only on `401`.
- Requests are **serialized** and **spread** evenly across the poll interval with
  jitter (never 15 in a row), with a hard minimum gap between any two calls.
- Poll interval is clamped to at least 300s (the server's own `refreshTime`).
- Plausible, varied latencies steer region selection (no `1` / `9999` tells).
- Exponential backoff with jitter on `429` / `5xx` / repeated fallbacks, and it
  pauses rather than retry-storming when the version can't be resolved or every
  region returns the fallback.

## Architecture

```
src/
  shared/   pure domain: regions, incentive math, formatting, DTOs (server + browser)
  server/   config, logger, auth providers, version resolver, BHVR client,
            poller + cache, Fastify HTTP (API + static SPA)
  web/      React + Vite + Tailwind SPA that reads only /api/incentives
```

Tech: TypeScript, Fastify, React + Vite + Tailwind, `steam-user` for full mode.
In-memory cache with a tiny JSON file for last-working-category persistence.

---

## Acknowledgments

- [**EigenvoidDev**](https://github.com/EigenvoidDev) for the excellent Dead by
  Daylight private API documentation.
- [**CutestLoaf**](https://github.com/CutestLoaf) for the help figuring out how to
  properly call the match-incentives endpoint.

## License

MIT. Dead by Daylight, Bloodpoints, and related marks are trademarks of Behaviour
Interactive. This project is an unofficial fan tool and ships no Behaviour assets.
