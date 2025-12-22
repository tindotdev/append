# Runbook

## Secrets management

Secrets are managed via Cloudflare's native tooling (no external tools like Doppler):

- **Local dev**: `.dev.vars` in `packages/api/` (gitignored)
- **Production**: `wrangler secret put <NAME>` (stored in Cloudflare)

### Setting production secrets

```bash
cd packages/api
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put BETTER_AUTH_SECRET
pnpm wrangler secret put BETTER_AUTH_URL      # https://api.append.tindev.dev
pnpm wrangler secret put ALLOWED_SUB          # or ALLOWED_EMAIL for bootstrap
```

### Listing/verifying secrets

```bash
pnpm wrangler secret list
```

## Auth configuration

Append uses Google SSO with a strict allowlist (ADR 0001). At least one of the
following must be configured, or auth will **fail closed** at runtime:

- `ALLOWED_SUB` (preferred) — Google account `sub`
- `ALLOWED_EMAIL` (fallback) — case-insensitive email

Required auth secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

Auth endpoints:

- Better Auth is mounted at `GET|POST /auth/*` (not `/api/auth/*`).
  - Local: `http://localhost:8787/auth/*`
  - Prod: `https://api.append.tindev.dev/auth/*`

### Bootstrapping `ALLOWED_SUB` (recommended)

`ALLOWED_SUB` is the stable Google account identifier ("sub"). The simplest flow is:

1. Set `ALLOWED_EMAIL` temporarily (to allow your first login).
2. Sign in once.
3. Read the created Google `sub` from the `account` table (`provider_id = 'google'`).
4. Set `ALLOWED_SUB` to that value and remove `ALLOWED_EMAIL`.

Local (against the `wrangler dev` DB):

```bash
cd packages/api
pnpm wrangler d1 execute append-db --local --command "SELECT account_id FROM account WHERE provider_id='google' LIMIT 1;"
```

Production (remote D1):

```bash
cd packages/api
pnpm wrangler d1 execute append-db --remote --command "SELECT account_id FROM account WHERE provider_id='google' LIMIT 1;"
```

## Deploy steps

CI/CD uses GitHub Actions (`.github/workflows/deploy.yml`) and runs on pushes to `main`.
Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_PAGES_PROJECT` (Cloudflare Pages project name)

Deploy order (automated):

1. Apply D1 migrations (remote).
2. Deploy the Worker API (Hono) to Cloudflare Workers.
3. Build and deploy the SPA to Cloudflare Pages.
4. Verify auth sign-in flow and basic API health.

Manual equivalent (from repo root):

```bash
# API (migrations + deploy)
pnpm --filter append-api exec wrangler d1 migrations apply append-db --remote --config packages/api/wrangler.jsonc
pnpm --filter append-api run deploy -- --config packages/api/wrangler.jsonc

# Web (build + deploy)
pnpm --filter append-web run build
pnpm --filter append-web exec wrangler pages deploy packages/web/dist --project-name "$CF_PAGES_PROJECT"
```

## Release tags (semver)

We use annotated git tags as milestones (e.g. completing a vertical slice). Tags are created manually; CI does not auto-tag.

Process:

1. Ensure `main` is green and up to date.
2. Create an annotated tag on the slice commit:
   - `git tag -a vX.Y.Z <sha> -m "Short release message"`
3. Push the tag:
   - `git push origin vX.Y.Z`
4. Create a GitHub Release (optional, recommended for notes):
   - `gh release create vX.Y.Z --generate-notes`

## Migrations

- Better Auth schema changes:
  1. `pnpm --filter append-api run auth:generate`
  2. `pnpm --filter append-api run db:generate`
  3. Apply D1 migrations (see deploy steps).
- App schema changes:
  1. `pnpm --filter append-api run db:generate`
  2. Apply D1 migrations before deploying new API code.
