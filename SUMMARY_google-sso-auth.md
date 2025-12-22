# Session Summary: Google SSO Auth

**Date**: 2025-12-20

## Objective

Implement Google SSO login as the first milestone of the `append` application, following ADR 0001 (allowlist-based authentication with sub-first, email fallback). This included setting up the API with Hono on Cloudflare Workers, D1 database integration, and a React SPA with sign-in UI.

## What Has Been Done

- Configured Google Cloud OAuth credentials with correct redirect URIs (`localhost:8787` for dev, `api.append.tindev.dev` for prod)
- Set up custom domain structure: `append.tindev.dev` (web) and `api.append.tindev.dev` (API)
- Created D1 database `append-db` and configured wrangler bindings (`packages/api/wrangler.jsonc`)
- Installed and configured `better-auth-cloudflare` plugin for Cloudflare Workers integration
- Created auth configuration with `withCloudflare()` wrapper (`packages/api/src/lib/auth/index.ts`)
- Generated Drizzle schema for better-auth tables (user, session, account, verification) via CLI
- Created `drizzle.config.ts` with local SQLite and remote D1 HTTP support via Doppler secrets
- Added migration scripts to `packages/api/package.json` (`auth:generate`, `db:generate`, `db:migrate:local`, `db:migrate:prod`)
- Applied migrations to both local and production D1 databases
- Implemented allowlist enforcement per ADR 0001 using `databaseHooks` (user.create.before, account.create.before)
- Added `assertAllowlistConfigured()` for fail-closed behavior
- Created auth client in web app (`packages/web/src/lib/auth.ts`) with better-auth React client
- Updated `packages/web/src/app.tsx` with sign-in/sign-out UI and session state
- Added `nodejs_compat` flag to wrangler for AsyncLocalStorage support
- Configured CORS and basePath alignment between client (`basePath: "/auth"`) and server

## What Worked

- **better-auth-cloudflare plugin**: Solved the D1 adapter and CLI schema generation issues by providing a unified pattern that works both at runtime (with env) and at CLI time (mock database)
- **Doppler integration for secrets**: `doppler run -- drizzle-kit push` enabled secure production migrations without exposing credentials
- **Database hooks for allowlist**: Using `databaseHooks.user.create.before` and `databaseHooks.account.create.before` cleanly enforced the allowlist without modifying better-auth internals

## What Was Tried (Did Not Work)

### Rolling custom OAuth
- **Tried**: Initially considered implementing OAuth from scratch to avoid better-auth complexity
- **Result**: User preferred using a library to reduce maintenance overhead
- **Why**: Custom auth requires handling edge cases (token refresh, session management) that libraries already solve

### better-auth CLI with factory pattern
- **Tried**: Running `@better-auth/cli generate` with a factory-based auth config (required for Workers env passing)
- **Result**: CLI failed with "Failed to initialize database adapter"
- **Why**: CLI needs a static `auth` export to introspect schema; solved by using `drizzleAdapter({} as D1Database, ...)` mock for CLI, real db for runtime

### `process.env` fallback in auth config
- **Tried**: Using `env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID` for CLI compatibility
- **Result**: Worker crashed with `ReferenceError: process is not defined`
- **Why**: Cloudflare Workers don't have `process` global; removed the fallback entirely

## Current Blockers (2025-12-22)

### `api.append.tindev.dev` DNS not resolving

Production login fails with `ERR_NAME_NOT_RESOLVED`:

```
GET https://api.append.tindev.dev/auth/get-session net::ERR_NAME_NOT_RESOLVED
POST https://api.append.tindev.dev/auth/sign-in/social net::ERR_NAME_NOT_RESOLVED
```

**Root cause**: Custom domain `api.append.tindev.dev` is not configured in Cloudflare DNS.

**Options to resolve**:
1. **Add DNS record**: In Cloudflare dashboard, add a CNAME record pointing `api.append.tindev.dev` to the Workers route (e.g., `append-api.tindotdev.workers.dev`)
2. **Use Workers URL directly**: Update `packages/web/src/lib/auth.ts` to use `https://append-api.tindotdev.workers.dev` as the production API URL (temporary workaround)
3. **Configure custom domain in Workers**: Use `wrangler` or dashboard to add a custom domain to the `append-api` worker

**Investigation needed**: Check Cloudflare dashboard for `tindev.dev` zone to see current DNS configuration and Workers custom domain settings.

## Recommended Next Steps

1. **Fix DNS for `api.append.tindev.dev`** - Configure custom domain in Cloudflare (see blocker above)
2. **Test production login flow** - Verify Google SSO works end-to-end once DNS is resolved
3. **Commit the auth implementation** - All files are modified but not yet committed
4. **Continue with Milestone 1** - Implement bucket feeds and manual sense creation per `docs/build-plan.md`

---

**Files Changed**: `packages/api/wrangler.jsonc`, `packages/api/package.json`, `packages/api/drizzle.config.ts`, `packages/api/src/index.ts`, `packages/api/src/lib/auth/index.ts`, `packages/api/src/db/index.ts`, `packages/api/src/db/schema.ts`, `packages/api/src/db/auth.schema.ts`, `packages/api/.dev.vars`, `packages/web/package.json`, `packages/web/src/app.tsx`, `packages/web/src/lib/auth.ts`, `.gitignore`
**Commits**: None yet (changes uncommitted)
