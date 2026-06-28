---
layout: home

hero:
  name: Bloodpoint Incentives
  text: Live DBD incentives, self-hosted
  tagline: A self-hostable hub that aggregates Dead by Daylight bloodpoint incentive data per platform and region, with a dashboard, a REST API, and a live stream.
  image:
    src: /favicon.svg
    alt: Bloodpoint Incentives
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /operations/

features:
  - icon: 🌍
    title: Per-platform, per-region
    details: Tracks the under-populated-role bonus across all Dead by Daylight regions on Windows/Steam, EGS/Epic, and GRDK/Microsoft Store.
  - icon: 🛰️
    title: Self-contained hub + agents
    details: A single Go hub aggregates readings and serves everything. Lightweight Node agents each poll one region+platform and report back over a bearer token.
  - icon: ⚡
    title: Live updates
    details: A Server-Sent Events stream pushes the latest incentives to browsers the instant an agent reports, with honest staleness flags.
  - icon: 📈
    title: History & forecasting
    details: Readings persist to SQLite for a zoomable per-region history graph and a next-24h bonus forecast with confidence bands.
  - icon: 🔌
    title: REST API + OpenAPI
    details: A resource-oriented API under /api/v1 documented by an OpenAPI 3.1 spec, with interactive docs and optional personal API keys.
  - icon: 🔐
    title: Accounts & access control
    details: Local accounts with optional TOTP or WebAuthn passkeys, admin/user roles, and an optional gate that requires login to view the whole site.
---
