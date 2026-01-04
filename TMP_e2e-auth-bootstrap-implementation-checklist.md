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

- [x] Define allowed web origins:
  - [x] local: `http://localhost:5173` — `lib/auth/index.ts:33`
  - [x] prod: `https://append.tindev.dev` — `lib/auth/index.ts:33`
  - [x] preview Pages: `https://*.append-web.pages.dev` — `lib/auth/index.ts:36`
- [x] Update `packages/api/src/index.ts` CORS middleware for `/auth/*` and `/api/*`:
  - [x] Do not use `*` with credentials — uses function-based origin matching
  - [x] Use dynamic origin allowlist (function) if wildcard support is needed — `index.ts:23-38` `isOriginAllowed()`
  - [x] Include `x-e2e-secret` in allowed headers for `/auth/*` — `index.ts:86`
- [x] Add preview-only CSRF mitigation for `/api/*` state changes:
  - [x] For `POST|PUT|DELETE /api/*`, require `Origin` header — `index.ts:116-140`
  - [x] Reject if origin not in the allowlist above — `index.ts:135-136`

## 3) Better Auth: trusted origins + preview cookie attributes

- [x] Update `packages/api/src/lib/auth/index.ts` Better Auth config:
  - [x] Add preview Pages origin(s) to `trustedOrigins` — `lib/auth/index.ts:134` uses `getAllowedOrigins(env)`
  - [x] Configure **preview-only** session cookie attributes:
    - [x] `SameSite=None` — `lib/auth/index.ts:112`
    - [x] `Secure` — `lib/auth/index.ts:109-111` (only in preview)

## 4) Implement `POST /auth/e2e/login` (Better Auth plugin endpoint)

- [x] Implement endpoint under Better Auth `/auth/*` — standalone Hono route at `/auth/e2e/login` (`lib/auth/e2e-login.ts`)
- [x] Runtime gating:
  - [x] If `APP_ENV === 'production'` → 404 — `e2e-login.ts:59-61`
  - [x] If `E2E_AUTH_SECRET` missing → 404 — `e2e-login.ts:64-67`
- [x] AuthZ gating:
  - [x] Require header `x-e2e-secret` to match secret (timing-safe compare) — `e2e-login.ts:70-74` + `secureCompare()` function
  - [x] Require `ALLOWED_EMAIL` configured and equals `E2E_AUTH_EMAIL` (case-insensitive) — `e2e-login.ts:77-86`
  - [x] Do not accept arbitrary email input — uses configured `E2E_AUTH_EMAIL` only
- [x] User provisioning:
  - [x] `findUserByEmail(E2E_AUTH_EMAIL)`; if missing, `createUser(...)` — `e2e-login.ts:98-121`
  - [x] Ensure default bucket seeding runs (via internalAdapter.createUser triggering databaseHooks)
- [x] Session provisioning:
  - [x] `createSession(userId)` — `e2e-login.ts:123-128`
  - [x] Set session cookie manually with proper attributes — `e2e-login.ts:130-145`
  - [x] Return `204 No Content` — `e2e-login.ts:148`
- [x] Logging:
  - [x] Log endpoint invocation (env + IP + UA + success/failure) without logging secret — `e2e-login.ts:91-93`
- [x] Mounted in `index.ts:192` before generic `/auth/*` handler

## 5) API tests (Worker)

- [x] Add a focused test that:
  - [x] Calls `/auth/e2e/login` with correct secret and observes `set-cookie` — `test/e2e-login.spec.ts:30-44`
  - [x] Creates user and session with correct data in DB — `test/e2e-login.spec.ts:47-76`
  - [x] Wrong secret → 403 — `test/e2e-login.spec.ts:78-87`
  - [x] Missing secret → 403 — `test/e2e-login.spec.ts:89-96`
  - [x] Reuses existing user on subsequent logins — `test/e2e-login.spec.ts:99-128`
  - [x] Links e2e account on first login — `test/e2e-login.spec.ts:130-140`
  - [x] E2E provider bypasses allowlist check in databaseHooks — `lib/auth/index.ts:211-215`
  - [x] ALLOWED_SUB bypass for E2E endpoint — `lib/auth/e2e-login.ts:84-88`

## 6) Playwright (web package)

- [x] Add Playwright `globalSetup`:
  - [x] Call `POST /auth/e2e/login` with `x-e2e-secret` (Node-side request) — `e2e/global-setup.ts:29-41`
  - [x] Save `storageState` to a file — `e2e/global-setup.ts:55-64`
- [x] Update Playwright config to support both modes:
  - [x] Local dev mode: start web server as today, run against localhost — `playwright.config.ts:43-48`
  - [x] Preview mode: `baseURL` is the deployed Pages URL, no local webServer — `playwright.config.ts:19-20`
- [x] Created E2E test files:
  - [x] Auth smoke test — `e2e/auth-smoke.spec.ts`
  - [x] Outbox happy path — `e2e/outbox-happy-path.spec.ts`
  - [x] Single sender (Web Locks) — `e2e/outbox-single-sender-locks.spec.ts`
  - [x] Single sender (Lease fallback) — `e2e/outbox-single-sender-lease.spec.ts`
  - [x] Offline retry — `e2e/outbox-offline-retry.spec.ts`
- [x] Test helpers — `e2e/helpers.ts`

## 7) CI (preview)

- [x] Add a Playwright job after preview deploy:
  - [x] Use deployed Pages URL as `baseURL` — `.github/workflows/preview.yml:169-170`
  - [x] Provide `E2E_AUTH_SECRET` via GitHub Actions secrets — `.github/workflows/preview.yml:168`
  - [x] Fail the PR check if E2E fails — E2E job runs in pipeline
  - [x] Upload playwright-report artifact — `.github/workflows/preview.yml:173-179`
  - [x] Update PR comment with E2E status — `.github/workflows/preview.yml:210-219`

## 8) Security verification (pre-merge)

- [ ] Production has no `E2E_AUTH_SECRET` configured.
- [ ] `/auth/e2e/login` unreachable in production (404).
- [ ] Preview cookies are `SameSite=None; Secure`.
- [ ] Preview `POST|PUT|DELETE /api/*` rejects missing/invalid Origin.
- [ ] No client bundle contains the secret.

## 9) Rollout / rollback

- [ ] Rollout: deploy API preview first; validate manual login in preview web; then enable Playwright.
- [ ] Rollback: unset `E2E_AUTH_SECRET` in preview to disable endpoint immediately; revert preview cookie change if needed.

