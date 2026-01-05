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
pnpm --filter @append/api exec wrangler d1 migrations apply append-db --remote --config packages/api/wrangler.jsonc
pnpm --filter @append/api run deploy -- --config packages/api/wrangler.jsonc

# Web (build + deploy)
pnpm --filter @append/web run build
pnpm --filter @append/web exec wrangler pages deploy packages/web/dist --project-name "$CF_PAGES_PROJECT"
```

## Preview deployments (PR environments)

PR previews use isolated Cloudflare resources to avoid affecting production:

- **Worker**: `append-api-preview` (preview environment in `wrangler.jsonc`)
- **Database**: `append-db-preview` (D1)
- **Storage**: `append-imports-preview` (R2)
- **AI Provider**: Stub (no OpenAI API calls or costs)

### One-time setup

These steps create the isolated preview infrastructure (already completed):

1. Create preview D1 database:

   ```bash
   pnpm --filter @append/api exec wrangler d1 create append-db-preview
   ```

2. Update `packages/api/wrangler.jsonc` with the database ID from step 1.

3. Create preview R2 bucket:

   ```bash
   pnpm --filter @append/api exec wrangler r2 bucket create append-imports-preview
   ```

4. Apply initial schema to preview database:

   ```bash
   pnpm --filter @append/api exec wrangler d1 migrations apply append-db-preview --remote --env preview
   ```

### How PR previews work

When a PR is opened against `main`:

1. GitHub Actions runs `.github/workflows/preview.yml`
2. Migrations are applied to the preview database
3. API deploys to the preview environment: `https://append-api-preview.tindotdev.workers.dev`
4. Web builds with `VITE_API_URL` set to preview API
5. Web deploys to Cloudflare Pages with branch-specific URL: `https://<branch>.<project>.pages.dev`
6. Both URLs are posted as a comment on the PR (updated on subsequent pushes)

**API URL configuration:**

- Local dev: `http://localhost:8787` (default when running `pnpm dev`)
- Preview: `https://append-api-preview.tindotdev.workers.dev` (set via `VITE_API_URL` in preview workflow)
- Production: `https://api.append.tindev.dev` (set via `VITE_API_URL` in deploy workflow)

### Manual preview deployment

To deploy manually to preview environments:

```bash
# API preview
pnpm --filter @append/api exec wrangler d1 migrations apply append-db-preview --remote --env preview
pnpm --filter @append/api exec wrangler deploy -e preview --config wrangler.jsonc

# Web preview (branch-specific)
VITE_API_URL=https://append-api-preview.tindotdev.workers.dev pnpm --filter @append/web run build
pnpm --filter @append/web exec wrangler pages deploy dist --project-name "$CF_PAGES_PROJECT" --branch <branch-name>
```

### Preview environment secrets

Preview environment has Google OAuth configured for authentication:

```bash
# Secrets are already set for preview environment
pnpm --filter @append/api exec wrangler secret list --env preview
```

Required secrets (already configured):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `ALLOWED_EMAIL` (or `ALLOWED_SUB`)

### E2E authentication for Playwright (ADR 0019)

Playwright E2E tests should not automate Google login UI flows. Instead, use the
non-production auth bootstrap endpoint:

- `POST /auth/e2e/login` (sets Better Auth session cookies; returns 204)

Preview web runs on `*.pages.dev` while preview API runs on `*.workers.dev`
(`pages.dev` → `workers.dev` is cross-site). To make preview auth work, the API
must allow the preview Pages origin and use preview-only cookie settings per ADR 0019.

Required preview configuration for E2E tests (ADR 0019):

- Secrets (preview Worker) — **not yet set**:
  - `E2E_AUTH_SECRET` — secret required by `x-e2e-secret` header
  - `E2E_AUTH_EMAIL` — dedicated email for E2E test user
- Vars (preview Worker) — already configured:
  - `APP_ENV=preview` (set in `wrangler.jsonc`)
- Allowlist — already configured:
  - `ALLOWED_EMAIL` is set for the owner's Google account

Set E2E secrets (required for Playwright tests):

```bash
pnpm --filter @append/api exec wrangler secret put E2E_AUTH_SECRET --env preview
pnpm --filter @append/api exec wrangler secret put E2E_AUTH_EMAIL --env preview
```

Also add `E2E_AUTH_SECRET` to GitHub Actions secrets for the workflow to use.

### Running E2E tests locally

To run Playwright E2E tests against local development servers:

1. Configure E2E secrets in `packages/api/.dev.vars`:

   ```bash
   E2E_AUTH_SECRET=your-local-e2e-secret-at-least-32-chars
   E2E_AUTH_EMAIL=your-test-email@example.com
   ```

2. Ensure the email is on your allowlist (`ALLOWED_EMAIL` or `ALLOWED_SUB`).

3. Start the API and web dev servers:

   ```bash
   # Terminal 1: API
   pnpm --filter @append/api dev

   # Terminal 2: Web
   pnpm --filter @append/web dev
   ```

4. Run Playwright tests:

   ```bash
   cd packages/web
   E2E_AUTH_SECRET=your-local-e2e-secret-at-least-32-chars pnpm test:e2e
   ```

5. For interactive debugging:

   ```bash
   E2E_AUTH_SECRET=your-local-e2e-secret-at-least-32-chars pnpm test:e2e:ui
   ```

### E2E secret rotation

To rotate the E2E secret in preview:

```bash
# Generate a new secret
openssl rand -base64 32

# Update in Cloudflare Worker
pnpm --filter @append/api exec wrangler secret put E2E_AUTH_SECRET --env preview

# Update in GitHub Actions secrets
# (manual step in GitHub repository settings)
```

### Preview environment notes

- Preview database and storage accumulate data over time (cleared manually if needed)
- Preview uses stub AI provider (no real OpenAI calls) to avoid costs
- Google OAuth secrets are configured for preview API; end-to-end auth from Pages previews is enabled via ADR 0019 (cross-site cookies + origins)

### Cloudflare Pages deployment

Cloudflare Pages has **automatic Git integration** that deploys separately from GitHub Actions:

- **Automatic deployment**: Triggered by Cloudflare when you push to GitHub. Uses environment variables from the **Cloudflare Pages dashboard**.
- **GitHub Actions workflow**: Defined in `.github/workflows/preview.yml`. Uses environment variables from the workflow file.

For preview builds to call the correct API, `VITE_API_URL` must be set in **both** places:
1. Cloudflare Pages dashboard → Settings → Environment variables → Preview
2. GitHub Actions workflow (already configured in `preview.yml`)

**Recommended**: After merging the preview workflow to main, disable Cloudflare's automatic Git integration (Settings → Builds & deployments → Disconnect Git) to use only GitHub Actions for deployments.

## Developer checks (local)

From repo root:

```bash
pnpm docs:policy
pnpm ci:lint
pnpm lint:boundaries
pnpm typecheck
pnpm test
```

API tests live under `packages/api/test/` and run via `pnpm test:api`.

### Test environment variables

Tests use `cloudflare:test` and the test environment variables configured in `packages/api/wrangler.jsonc`.
Common ones:

- `ENABLE_TEST_EMAIL_PASSWORD_AUTH=1`
- `BETTER_AUTH_URL=http://localhost:8787`
- `BETTER_AUTH_SECRET=...` (32+ chars)
- `ALLOWED_EMAIL=test-a@example.com`
- `GOOGLE_CLIENT_ID=test-google-client-id` (dummy; tests don’t hit Google OAuth)

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

## Review pass (post-slice)

When doing a refactor/review pass, treat `docs/design.md` + ADRs as the baseline.

Checklist:

1. Re-verify critical flows: capture → suggest → review → accept-all → bucket feed → export.
2. Confirm behavior still matches `docs/design.md` invariants and relevant ADR constraints (request/response shapes, error codes, status transitions).
3. Spot-check UI for the "calm by default" feed and explicit review affordances.
4. If refactoring touches API behavior, update docs and add a targeted regression test.

## Migrations

- Better Auth schema changes:
  1. `pnpm --filter @append/api run auth:generate`
  2. `pnpm --filter @append/api run db:generate`
  3. Apply D1 migrations (see deploy steps).
- App schema changes:
  1. `pnpm --filter @append/api run db:generate`
  2. Apply D1 migrations before deploying new API code.
