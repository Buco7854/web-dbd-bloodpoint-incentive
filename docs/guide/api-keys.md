# API keys

API keys give programmatic clients a stable credential to call the hub's API as a
particular user. They're the recommended way to use the API from scripts and
services.

## Enabling API keys

API keys are off by default. Turn them on with:

```bash
ENABLE_API_KEYS=true
```

Once enabled, any logged-in user can mint keys from their account page.

## Minting a key

1. Log in to the hub.
2. Open the account page and create a key.
3. Copy it immediately: the key is shown once at creation and never again.

::: warning Keys are shown once
The hub stores only a SHA-256 hash of the key, never the raw value. If you
lose it, you can't recover it. Mint a new one and delete the old.
:::

## Using a key

Send the key on each request, either as a bearer token or in a dedicated header:

```bash
# Authorization header (recommended)
curl -H "Authorization: Bearer bpi_xxxxxxxxxxxxxxxx" \
  https://bpincentives.com/api/v1/platforms/Windows/incentives

# Or the X-API-Key header
curl -H "X-API-Key: bpi_xxxxxxxxxxxxxxxx" \
  https://bpincentives.com/api/v1/platforms/Windows/incentives
```

Keys are prefixed `bpi_`.

## What a key authenticates as

A key authenticates as its owner and inherits that user's role. An admin's
key can reach admin endpoints. A regular user's key cannot. Treat a key as
equivalent to that user's credentials.

## When keys actually matter

This depends on `REQUIRE_AUTH`:

- **`REQUIRE_AUTH` off (default):** the read endpoints are public to everyone, so
  you don't need a key just to read incentives. Keys still matter for
  authenticated (e.g. admin) endpoints.
- **`REQUIRE_AUTH` on:** every read requires a session or an API key, so a key is
  how a non-browser client gets in at all.

See [Authentication](./authentication#the-optional-site-gate-require-auth) for the
gate, and [Using the API](./api) for the endpoints themselves.
