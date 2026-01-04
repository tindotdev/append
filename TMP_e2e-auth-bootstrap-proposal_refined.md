---
temporary: true
created: 2026-01-04
purpose: review-output
source: TMP_e2e-auth-proposal.md
---

# E2E auth for preview + Playwright (refined proposal)

This document refines `TMP_e2e-auth-proposal.md` to match the repo’s **current architecture** and **existing ADR constraints**, and highlights the missing requirements needed for preview environments to work reliably.

> Note: Per `docs/README.md` (documentation policy), this proposal/checklist should live in an issue/PR description. The durable decision is now captured in ADR 0019: `docs/adr/0019-e2e-auth-bootstrap-preview.md`.

## 1) Repo findings (constraints + current behavior)

### Canonical decisions

- **Auth model**: Google SSO + strict allowlist (fail-closed). `docs/adr/0001-google-allowlist-auth.md`
- **Architecture**: SPA (TanStack Router) on Pages + API (Hono) on Workers; D1. `docs/adr/0004-spa-hono-workers.md`, `docs/design.md`
- **Preview deployments**: API preview Worker + D1 preview + Pages branch URLs. `docs/runbook.md`, `.github/workflows/preview.yml`, `packages/api/wrangler.jsonc`

### Current auth implementation (Better Auth)

- Better Auth mounted at `GET|POST /auth/*` (`packages/api/src/index.ts`).
- All `POST|GET /api/*` routes are guarded by session middleware using `auth.api.getSession()` (`packages/api/src/index.ts`).
- Allowlist enforcement happens via Better Auth `databaseHooks` (`packages/api/src/lib/auth/index.ts`):
  - `ALLOWED_SUB` enforced on `account.create` for `providerId === 'google'`.
  - Non-Google providers require `ALLOWED_EMAIL` match (fail closed if missing).
  - `user.create.after` seeds default buckets.

### Preview environment mismatch (must fix for *any* real preview auth)

Preview web is deployed to `https://<branch>.append-web.pages.dev` (see `.github/workflows/preview.yml`), while preview API is on `https://*.workers.dev` (see `packages/api/wrangler.jsonc` / `docs/runbook.md`).

This is **cross-site** (`pages.dev` → `workers.dev`). Better Auth cookies default to `SameSite=Lax` (see `better-auth` cookie defaults), which means **cookies will not be sent on XHR/fetch cross-site**. Result: preview web cannot stay authenticated against preview API unless we address this.

Additionally:

- Better Auth `trustedOrigins` is currently hardcoded to `http://localhost:5173` and `https://append.tindev.dev` (`packages/api/src/lib/auth/index.ts`) and does **not** include Pages preview origins.
- Hono CORS allowlists for `/auth/*` and `/api/*` do **not** include Pages preview origins (`packages/api/src/index.ts`).

## 2) Final decision proposal (validated + refined)

### Decision

Implement a **non-production-only** auth bootstrap endpoint for Playwright that creates a valid Better Auth session cookie **without Google UI automation**, protected by a secret and constrained to the existing allowlist semantics.

### Key refinement vs draft

1. Place the endpoint under **`/auth/*`**, not `/api/*`, to avoid the global `/api/*` auth guard and to keep “auth surface area” centralized:
   - Proposed: `POST /auth/e2e/login`
2. Fix preview auth fundamentals (required regardless of endpoint):
   - Add preview Pages origins to both **CORS** and Better Auth **trustedOrigins**.
   - Make preview cookies usable cross-site:
     - **Current decision (ADR 0019)**: set Better Auth cookies to `SameSite=None; Secure` in preview.
     - **Future improvement**: serve preview web from a same-site domain (so `SameSite=Lax` works and CSRF exposure is reduced).

### Endpoint behavior (high-level)

`POST /auth/e2e/login`

- Only enabled when **`APP_ENV != 'production'`** and an **`E2E_AUTH_SECRET`** is configured.
- Requires `x-e2e-secret: <token>` header (constant-time compare).
- Creates (or reuses) a dedicated E2E user and sets a Better Auth session cookie:
  - Email comes from config (`E2E_AUTH_EMAIL`) and must be allowlisted:
    - Require `ALLOWED_EMAIL` to be set and equal to `E2E_AUTH_EMAIL` (keeps “fail-closed allowlist” as the gate).
  - Use Better Auth internals (via a Better Auth plugin endpoint) to:
    - `findUserByEmail` → `createUser` if needed (ensures default bucket seeding runs)
    - `createSession(userId)`
    - `setSessionCookie(...)`
- Response: `204 No Content` (cookie is the payload).

Why this fits the repo:

- Aligns with ADR 0001: access remains allowlist-gated and fail-closed; no production bypass.
- Aligns with architecture: keeps auth under Better Auth `/auth/*` and keeps `/api/*` guarded as-is.
- Avoids enabling new interactive auth methods (email/password) in preview just for tests.

## 3) Security model (threats + mitigations)

### Threat: production exposure

- Mitigation: endpoint is not registered (or returns 404) when `APP_ENV === 'production'`.
- Mitigation: production does not set `E2E_AUTH_SECRET` at all.

### Threat: secret leakage to browser bundle

- Mitigation: keep `E2E_AUTH_SECRET` server-side only (Worker secret / Secrets Store binding), never in `VITE_*`.
- Mitigation: Playwright pulls secret from CI secrets; never from client JS.

### Threat: brute force / scanning of endpoint in preview

- Mitigation: secret required; deny on missing/invalid secret.
- Mitigation: minimal rate limiting (nice-to-have) + audit log with IP/UA when invoked.

### Threat: bypass allowlist semantics

- Mitigation: endpoint refuses to mint a session unless `ALLOWED_EMAIL` is configured and matches the configured E2E email.
- Mitigation: endpoint does not accept arbitrary email input (or accepts it but enforces exact allowlist match).

### Threat: CSRF / cross-site cookie risk (preview only)

If preview uses `SameSite=None` cookies (to support `pages.dev` → `workers.dev`), cookies become cross-site sendable.

- Mitigation (recommended): add an Origin check middleware for **state-changing** `/api/*` requests in preview that matches the same origin allowlist as CORS.
- Mitigation (baseline): keep CORS origin strict (pattern match only `https://*.append-web.pages.dev`) and do not allow `*`.

## 4) Implementation plan (high-level)

1. **Environment identification**
   - Add `APP_ENV` binding (e.g., `local | preview | production | test`) in `packages/api/wrangler.jsonc` and types (`packages/api/src/platform/bindings.ts`).
2. **Preview origin + cookie correctness**
   - Update Better Auth `trustedOrigins` to include `https://*.append-web.pages.dev` for preview.
   - Update Hono CORS for `/auth/*` and `/api/*` to include the same preview origin pattern.
   - Set preview cookie attributes to `SameSite=None; Secure` (ADR 0019).
3. **Add the E2E bootstrap endpoint**
   - Implement as a Better Auth plugin endpoint mounted under `/auth/e2e/login`.
   - Enforce: non-prod only, secret required, allowlisted email only.
4. **Playwright integration**
   - Add `globalSetup` that calls `/auth/e2e/login`, stores `storageState`, and runs tests with that state.
5. **CI wiring**
   - Add an E2E job to `.github/workflows/preview.yml` (or a follow-on workflow) that:
     - consumes the deployed Pages URL as Playwright `baseURL`
     - uses CI secret for `x-e2e-secret`
6. **Verification**
   - Add a small API-side test that endpoint sets cookie and `GET /auth/get-session` succeeds with it.

## 5) Ticket checklist (ready to paste)

### Acceptance criteria

- [ ] Preview web (`https://<branch>.append-web.pages.dev`) can authenticate and call preview API with cookies.
- [ ] Playwright can obtain authenticated `storageState` without Google UI automation.
- [ ] Endpoint is unreachable in production (404) and not accidentally enabled by config drift.
- [ ] Endpoint cannot mint sessions for non-allowlisted users.

### API changes

- [ ] Add `APP_ENV` to Worker env bindings.
- [ ] Add `E2E_AUTH_SECRET` (secret) and `E2E_AUTH_EMAIL` (var/secret) bindings.
- [ ] Update Better Auth `trustedOrigins` to include:
  - [ ] local: `http://localhost:5173`
  - [ ] prod: `https://append.tindev.dev`
  - [ ] preview: `https://*.append-web.pages.dev`
- [ ] Update Hono CORS origins similarly for `/auth/*` and `/api/*`.
- [ ] Implement `POST /auth/e2e/login`:
  - [ ] non-prod gating (`APP_ENV`)
  - [ ] secret header required (`x-e2e-secret`)
  - [ ] allowlist enforcement (`ALLOWED_EMAIL` must match configured E2E email)
  - [ ] sets Better Auth session cookie; returns 204
- [ ] Add preview-only Origin checks for state-changing `/api/*` requests (ADR 0019).

### Secrets / config

- [ ] Set preview Worker secrets:
  - [ ] `E2E_AUTH_SECRET` (random 32+ bytes)
  - [ ] `ALLOWED_EMAIL` = E2E email (or set `ALLOWED_SUB` + `ALLOWED_EMAIL` together if you still want owner Google access)
- [ ] Add GitHub Actions secret for Playwright job: `E2E_AUTH_SECRET`.

### Playwright changes

- [ ] Add `globalSetup` to login once and write `storageState`.
- [ ] Configure tests to use that `storageState`.
- [ ] Ensure baseURL can be overridden via env (local vs preview deployed URL).

### Security verification

- [ ] Confirm `POST /auth/e2e/login` returns 404/403 in production.
- [ ] Confirm endpoint rejects missing/incorrect secret.
- [ ] Confirm endpoint rejects when allowlist not configured.
- [ ] Confirm logs contain invocation metadata (timestamp, env, IP/UA).

## 6) Test plan

- **Unit-ish (API)**:
  - Call `/auth/e2e/login` with correct secret → expect `set-cookie` present.
  - Call `/auth/get-session` with that cookie → expect user/session returned.
  - Wrong secret → 401/403.
  - `APP_ENV=production` → 404.
- **Integration (preview)**:
  - From a browser at Pages preview URL, sign-in UX works and API calls succeed (cookie roundtrip).
- **E2E (Playwright)**:
  - globalSetup logs in via `/auth/e2e/login`, storageState reused across specs.

## 7) Open questions / future improvements (optional)

1. **Preview cookie strategy**
   - Current: `SameSite=None; Secure` in preview (ADR 0019).
   - Future improvement: move preview web to a same-site domain and revert to `SameSite=Lax`.
2. **Where to encode “non-prod”**
   - Default: explicit `APP_ENV` binding in `wrangler.jsonc` and local dev vars.
3. **Which allowlist value to use for E2E**
   - Default: require `ALLOWED_EMAIL` to match a dedicated E2E email.
   - If you still want owner access in preview: set both `ALLOWED_SUB` (owner) and `ALLOWED_EMAIL` (E2E).
