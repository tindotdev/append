---
temporary: true
created: 2026-01-04
purpose: implementation-checklist
related_adr: docs/adr/0019-e2e-auth-bootstrap-preview.md
source: TMP_e2e-auth-bootstrap-proposal_refined.md
---

# Implementation checklist — E2E auth bootstrap (preview + Playwright)

Temporary, implementation-oriented checklist for executing ADR 0019.
Paste this into the issue tracker / PR description and delete when complete.

## 0) Inputs (fill in)

- [ ] `E2E_AUTH_EMAIL`: ______________________________
- [ ] `E2E_AUTH_SECRET` created (32+ random bytes): ✅/❌
- [ ] Preview allowlist strategy:
  - [ ] Owner Google access via `ALLOWED_SUB`
  - [ ] E2E access via `ALLOWED_EMAIL == E2E_AUTH_EMAIL`

## 1) Worker env + bindings

- [x] Add `APP_ENV` to `packages/api/wrangler.jsonc` vars for:
  - [x] local/dev — via .dev.vars (gitignored), default vars line 39 fallback
  - [x] preview (`preview`) — `wrangler.jsonc:90`
  - [x] production (`production`) — `wrangler.jsonc:39` (default) + `wrangler.jsonc:119` (explicit env)
  - [x] test (`test`) — `wrangler.jsonc:155`
- [x] Add bindings to `packages/api/src/platform/bindings.ts`:
  - [x] `APP_ENV` — `bindings.ts:34`
  - [x] `E2E_AUTH_EMAIL` — `bindings.ts:36`
  - [x] `E2E_AUTH_SECRET` — `bindings.ts:35`
- [x] Ensure secrets are server-only (no `VITE_*` usage) — confirmed, all in Bindings type only.

## 2) Preview origins + CORS (Pages → Workers)

- [ ] Define allowed web origins:
  - [ ] local: `http://localhost:5173`
  - [ ] prod: `https://append.tindev.dev`
  - [ ] preview Pages: `https://*.append-web.pages.dev` (or the actual Pages project hostname)
- [ ] Update `packages/api/src/index.ts` CORS middleware for `/auth/*` and `/api/*`:
  - [ ] Do not use `*` with credentials
  - [ ] Use dynamic origin allowlist (function) if wildcard support is needed
  - [ ] Include `x-e2e-secret` in allowed headers for `/auth/*` (optional but helpful)
- [ ] Add preview-only CSRF mitigation for `/api/*` state changes:
  - [ ] For `POST|PUT|DELETE /api/*`, require `Origin` header
  - [ ] Reject if origin not in the allowlist above

## 3) Better Auth: trusted origins + preview cookie attributes

- [ ] Update `packages/api/src/lib/auth/index.ts` Better Auth config:
  - [ ] Add preview Pages origin(s) to `trustedOrigins` (wildcard pattern ok for Better Auth).
  - [ ] Configure **preview-only** session cookie attributes:
    - [ ] `SameSite=None`
    - [ ] `Secure` (do not break local http dev)

## 4) Implement `POST /auth/e2e/login` (Better Auth plugin endpoint)

- [ ] Implement endpoint under Better Auth `/auth/*` (plugin endpoint), not Hono `/api/*`.
- [ ] Runtime gating:
  - [ ] If `APP_ENV === 'production'` → 404
  - [ ] If `E2E_AUTH_SECRET` missing → 404 (or 403)
- [ ] AuthZ gating:
  - [ ] Require header `x-e2e-secret` to match secret (timing-safe compare).
  - [ ] Require `ALLOWED_EMAIL` configured and equals `E2E_AUTH_EMAIL` (case-insensitive).
  - [ ] Do not accept arbitrary email input.
- [ ] User provisioning:
  - [ ] `findUserByEmail(E2E_AUTH_EMAIL)`; if missing, `createUser(...)`
  - [ ] Ensure default bucket seeding runs (avoid raw DB inserts).
- [ ] Session provisioning:
  - [ ] `createSession(userId)` and `setSessionCookie(...)`
  - [ ] Return `204 No Content`
- [ ] Logging:
  - [ ] Log endpoint invocation (env + IP + UA + success/failure) without logging secret.

## 5) API tests (Worker)

- [ ] Add a focused test that:
  - [ ] Calls `/auth/e2e/login` with correct secret and observes `set-cookie`.
  - [ ] Calls `/auth/get-session` with that cookie and expects a user/session response.
  - [ ] Wrong secret → 401/403.
  - [ ] `APP_ENV=production` → 404.

## 6) Playwright (web package)

- [ ] Add Playwright `globalSetup`:
  - [ ] Call `POST /auth/e2e/login` with `x-e2e-secret` (Node-side request)
  - [ ] Save `storageState` to a file
- [ ] Update Playwright config to support both modes:
  - [ ] Local dev mode: start web server as today, run against localhost
  - [ ] Preview mode: `baseURL` is the deployed Pages URL, no local webServer
- [ ] Remove auth stubbing once real auth is used (or keep only for unit-ish UI tests).

## 7) CI (preview)

- [ ] Add a Playwright job after preview deploy:
  - [ ] Use deployed Pages URL as `baseURL`
  - [ ] Provide `E2E_AUTH_SECRET` via GitHub Actions secrets
  - [ ] Fail the PR check if E2E fails

## 8) Security verification (pre-merge)

- [ ] Production has no `E2E_AUTH_SECRET` configured.
- [ ] `/auth/e2e/login` unreachable in production (404).
- [ ] Preview cookies are `SameSite=None; Secure`.
- [ ] Preview `POST|PUT|DELETE /api/*` rejects missing/invalid Origin.
- [ ] No client bundle contains the secret.

## 9) Rollout / rollback

- [ ] Rollout: deploy API preview first; validate manual login in preview web; then enable Playwright.
- [ ] Rollback: unset `E2E_AUTH_SECRET` in preview to disable endpoint immediately; revert preview cookie change if needed.

