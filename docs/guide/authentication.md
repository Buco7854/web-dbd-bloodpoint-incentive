# Authentication

This page covers hub accounts: the user accounts, sessions, and the optional
gate that protect the dashboard and admin UI. (The separate matter of how an
_agent_ authenticates to Dead by Daylight's API is covered in
[Running an agent](./running-an-agent). The two are independent.)

## Accounts and roles

The hub has real user accounts with two roles:

- **`admin`**: can manage agents, view and purge data, and administer the hub.
- **`user`**: a regular account (relevant mainly when the site is gated, or for
  minting [API keys](./api-keys)).

## First factor: local username + password

Authentication is local: a username and password. Passwords are hashed with
scrypt. Sessions are tracked with signed, HttpOnly cookies (`SESSION_SECRET`
signs them), and state-changing requests carry a CSRF token.

::: tip
Set `SESSION_SECRET` to a long random string in production. If it's unset the hub
generates an ephemeral secret and all sessions reset on every restart.
:::

## Second factor (optional): TOTP or passkey

An account can add a second factor:

- **TOTP**: a time-based one-time-password app (authenticator).
- **WebAuthn passkey**: a hardware or platform passkey. Passkeys require
  `ORIGIN` to be set (and `RP_ID` / `RP_NAME` configure the relying party).

### MFA-enforcement policy

A policy decides which roles must have a second factor. By default, admins are
required to have one: an admin enrolls a second factor on first login if
they don't have one yet.

### Remembering a device

At the second-factor prompt you can tick "Remember this device for 30 days". The
hub then sets a separate, long-lived cookie so that browser skips the step-up on
later logins (the password is still required). The choice is per browser, so a
new browser or a cleared cookie asks for the second factor again. Changing your
password revokes every remembered device, and "Account, Remembered devices,
Forget remembered devices" clears them on demand.

## Creating the first admin

On first run the hub has no admin. Create one in either way:

- **The `/setup` page**: a one-time page that creates the first admin
  interactively. It's only available while no admin exists.
- **`ADMIN_BOOTSTRAP_*`**: set `ADMIN_BOOTSTRAP_USER` and
  `ADMIN_BOOTSTRAP_PASSWORD` (optionally `ADMIN_BOOTSTRAP_EMAIL` /
  `ADMIN_BOOTSTRAP_NAME`) to seed the first admin without the setup page.

See [Running the hub](./self-hosting#first-run-creating-the-first-admin).

## The optional site gate: `REQUIRE_AUTH`

By default the dashboard and read API are public: anyone can view them.
Set:

```bash
REQUIRE_AUTH=true
```

to require a logged-in session to view the whole site. Two things stay exempt
even when the gate is on:

- `GET /healthz`, and
- the `/api/v1/agent/*` ingest routes (which use per-agent token auth).

When the gate is on, a read endpoint accepts a session or an
[API key](./api-keys). When it's off, the read endpoints are public to
everyone and API keys matter much less.

## Related

- [API keys](./api-keys): programmatic access tokens that authenticate as a user.
- [Configuration](./configuration#auth-see-authentication): the full list of
  auth environment variables.
