# API Reference

The hub exposes a resource-oriented REST API under `/api/v1`, described by an
OpenAPI 3.1 spec generated directly from the server. Every endpoint below is
rendered from that spec, so it always matches the running hub.

- **Base URL:** `https://bpincentives.com/api/v1`
- **Authentication:** a browser session cookie, a personal API key
  (`Authorization: Bearer bpi_…`), or an agent token, depending on the endpoint.
  See [Authentication](/guide/authentication) and [API keys](/guide/api-keys).

Pick an operation from the sidebar to see its parameters, request body,
responses, and a ready-to-run example.
