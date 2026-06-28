# How it works

The hub and its agents have a deliberately simple contract: agents observe one
region+platform each and report what they see. The hub aggregates, persists, and
publishes. This page describes that flow.

## Aggregation: most-recent reading wins

Incentives are segmented by platform (matchmaking pools differ per platform) and
by region. The hub keeps, for each `(region, platform)` pair, the most recent
accepted reading.

This is what makes redundancy clean: you can run several agents covering the same
region+platform, and the hub simply keeps whichever reported most recently. The
others collapse into the same slot rather than fighting each other.

A reading only counts as real when it carries a genuine bonus (the hub never
shows a fallback as if it were a real value). Each region also exposes a
freshness state, so a reading older than the staleness threshold is flagged
stale rather than silently presented as current.

## Agents are assigned by the hub

An agent container is configured with only its hub URL, its token, and its Dead
by Daylight account credentials. It does not decide what to cover. On start it
calls the hub's assignment endpoint with its token and is told:

- its region,
- its platform (derived from the provider/auth method, a Steam agent reports
  `Windows`),
- its poll cadence (a resolved `[min, max]` interval), and
- a phase offset for spacing.

The hub maps each token to a region and provider. The platform is tied to the
auth method and is never set independently. Reports that don't match the token's
assignment are rejected, and a report may only write its own region+platform.

## The hub owns the poll cadence

Polling cadence is decided by the hub, not the agent. The hub hands each agent a
resolved `[min, max]` interval plus a phase offset.

- **Both bounds are used.** The beat is the midpoint of `[min, max]` and the
  jitter is half the width, so the gap between two polls always lands within the
  interval instead of firing at a fixed rate.
- **Spacing is anchored to the wall clock.** Redundant agents are evenly spaced
  by phase offset, so they stay spread out no matter when each one started or
  restarted (thundering-herd avoidance). Agents sharing an interval spread
  perfectly evenly. If intervals differ, the most common interval gets the
  evenly-spaced backbone and the odd ones fill the biggest gaps.
- Cadence can be an expression using `%refreshTime%` (alias `%auto%`), which
  resolves to Dead by Daylight's own live refresh cadence. Agents report
  `refreshTime` with each reading (the hub can't reach agents behind NAT), so the
  hub learns it and resolves expressions like `%refreshTime% * 1.33`. Until a
  value is known the hub uses a 300-second bootstrap interval.
- **No timer re-fetch is needed.** Every report response carries the agent's
  current assignment, so a cadence change (or re-spacing once `refreshTime`
  arrives) propagates on the agent's next report.

There is a hard 300-second floor on how fast the hub will ask an agent to poll,
which keeps each agent's request volume low.

See [Configuration](./configuration) for the cadence-related knobs
(`POLL_MIN_SECONDS`, `POLL_MAX_SECONDS`, and the agent-side accepted range).

## Persistence for history and forecasting

Every accepted reading is stored in a small SQLite database. This serves two
purposes beyond the live incentives:

- **History**: the per-region graph reads from this store, so the dashboard can
  show the survivor and killer bonus over time. Because readings persist, they
  also survive a hub restart.
- **Forecasting**: the next-24h forecast trains on this history. The amount of
  history it trains on is configured separately from the retention window (see
  `FORECAST_WINDOW_DAYS` and `DATA_RETENTION_DAYS`).

Old readings are pruned past the configured retention window (31 days by
default). See [Forecasting model](./forecasting) for how the forecast is built.

## Live updates over SSE

The dashboard stays live through a per-platform Server-Sent Events stream.
The hub sends the current incentives on connect, then again whenever an accepted
reading changes that platform (pushed the instant an agent reports), plus a
low-frequency re-send so stale flags flip even without a new reading. Unchanged
payloads are de-duplicated so they aren't re-sent, and the browser
auto-reconnects with backoff.

The stream is meant for browsers. Programmatic clients should poll the JSON
incentives endpoint instead. See [Using the API](./api).
