# ADR 0021 — Extension auth via device tokens (bearer)

Date: 2026-01-08

## Status

Accepted.

## Context

The Chrome extension (MV3) needs to call `POST /events/ingest` reliably:

- In local development (`http://localhost:8787`) and production (`https://api.append.tindev.dev`).
- Without depending on the browser having a first-party session cookie for the API domain.
- With retry-safe semantics (outbox + server-side dedupe).

The existing API authentication is Better Auth session cookies (Google SSO on the web app).

Extension requests originate from `chrome-extension://<id>` and are not a normal web origin; cookie-based auth is brittle due to CORS/origin constraints and cookie policies (especially on localhost where `SameSite=None; Secure` is not viable).

## Decision

Use **device tokens** for extension auth:

- The web app (cookie-authenticated) mints a device token via `POST /api/device-tokens`.
- The token is shown once, copied into the extension, and stored in `chrome.storage.local`.
- The extension calls `POST /events/ingest` with `Authorization: Bearer <token>`.
- The server stores only a hash of the token (sha256) and supports revocation.

## Consequences

Pros:

- Works cleanly in local dev + production, independent of cookie policy.
- Keeps Google SSO surface limited to the web app.
- Easy to revoke/rotate per device.
- Aligns with “events-first” ingestion needs (reliable background uploading).

Cons:

- User must perform a one-time “paste token into extension” step (pairing UX).
- Tokens are bearer credentials and must be handled carefully (no logs, no storage outside extension).

## Implementation notes

- Token management endpoints:
  - `POST /api/device-tokens` (mint; returns token once)
  - `GET /api/device-tokens` (list metadata)
  - `DELETE /api/device-tokens/:id` (revoke)
- Ingest accepts bearer token on `/events/*` and derives `user_id` from the token.
- CORS for `/events/*` allows `chrome-extension://...` origin and `Authorization` header.

### Security: Extension allowlist + required bearer auth

To prevent arbitrary Chrome extensions from using the user's SSO cookies:

1. **Extension ID allowlist**: CORS only accepts `chrome-extension://<id>` origins where `<id>` is in the `ALLOWED_EXTENSION_IDS` environment variable (comma-separated list).
2. **Bearer token required**: Extension-origin requests MUST provide a valid bearer token; cookie-based session auth is rejected for extension origins.

This defense-in-depth ensures only authorized extensions can access `/events/*`, and they must use proper device tokens rather than piggybacking browser cookies.

Environment variable:
- `ALLOWED_EXTENSION_IDS` — Comma-separated list of 32-char extension IDs (e.g., `abcdefghijklmnopabcdefghijklmnop,bcdefghijklmnopabcdefghijklmnopq`)
- If unset or empty, all extension origins are rejected (secure by default).

