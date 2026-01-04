# ADR 0019 — E2E auth bootstrap for preview + Playwright

Status: Accepted
Date: 2026-01-04

## Context

Append uses **Google SSO only** with a strict allowlist (ADR 0001).

We now have:

- PR preview environments (Pages preview + Workers preview + D1 preview).
- Playwright E2E tests that should validate real end-to-end behavior.

Automating Google login UI flows in Playwright is unreliable and slow.

Additionally, preview web (`*.pages.dev`) and preview API (`*.workers.dev`) are **cross-site**. Better Auth session cookies default to `SameSite=Lax`, which means cookies are not sent on cross-site XHR/fetch. Without changes, preview auth will not work reliably from the Pages preview origin.

## Decision

### 1) Add a non-production auth bootstrap endpoint for E2E

Add a **non-production-only** endpoint:

- `POST /auth/e2e/login`

Characteristics:

- Implemented under Better Auth’s `/auth/*` surface (not `/api/*`) to avoid the global `/api/*` auth guard.
- Enabled only when `APP_ENV !== "production"`.
- Requires `x-e2e-secret: <token>` header (server-side secret; constant-time compare).
- Mints sessions **only** for a configured E2E user email and only when allowlist constraints are met.
  - The endpoint must not accept arbitrary user input that bypasses the allowlist.
- Creates a Better Auth session and sets the same session cookie(s) as normal sign-in.
- Returns `204 No Content` (cookie is the payload).

Playwright uses this endpoint in `globalSetup` to generate `storageState` and avoids Google UI automation entirely.

### 2) Make preview auth work from Pages preview origins

To support the current preview topology (`pages.dev` → `workers.dev`):

- Add the Pages preview origin pattern (e.g. `https://*.append-web.pages.dev`) to:
  - Better Auth `trustedOrigins`
  - Hono CORS allowlists for `/auth/*` and `/api/*`
- In **preview only**, configure Better Auth session cookies as:
  - `SameSite=None; Secure`

Because `SameSite=None` allows cookies to be sent in cross-site contexts, add defense-in-depth for preview:

- Require a valid `Origin` header for state-changing `/api/*` requests (POST/PUT/DELETE) and reject if the origin is not the allowed preview Pages origin (matching the same allowlist as CORS).

Production remains unchanged:

- No E2E endpoint.
- No cross-site cookie settings.

## Consequences

### Positive

- Playwright E2E tests can authenticate deterministically without Google UI automation.
- Preview environments become usable for real auth testing (Pages preview can stay signed-in against preview API).
- The bootstrap flow stays aligned with ADR 0001 (fail-closed posture; allowlist is still the gate).

### Negative / risks

- Adds a privileged non-prod endpoint; misconfiguration could expose it unintentionally.
- `SameSite=None` in preview increases CSRF risk if origin controls are too permissive.
- Requires extra env/secrets management in preview and CI.

## Alternatives considered

1. **Automate Google login UI in Playwright** — rejected: flaky, slow, and brittle against provider UI/anti-bot changes.
2. **Keep Playwright stubbing auth** — rejected: doesn’t validate the real session/cookie + API guard integration.
3. **Enable email/password auth in preview** — rejected: expands the auth surface and conflicts with the current “test env is localhost only” safety posture.
4. **Use Cloudflare Access instead of in-app auth** — rejected: conflicts with the decision to have in-app sign-in (ADR 0001).

## Related

- ADR 0001: `docs/adr/0001-google-allowlist-auth.md`
- Runbook (preview topology + secrets): `docs/runbook.md`
