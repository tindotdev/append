# Runbook

## Developer setup

New machine setup:

```bash
just setup  # Install deps, sync secrets from Doppler, run migrations
just dev    # Start development servers
```

See `justfile` for available commands.

### Testing the Chrome extension locally

**IMPORTANT**: To test the Chrome extension locally, you **must** configure `ALLOWED_EXTENSION_IDS` in Doppler before running `just setup`:

```bash
# Required for extension development
doppler secrets set ALLOWED_EXTENSION_IDS="nnhipglpoenbcdonkbnfdcmfcfaggjle" --project apps --config dev_append
just sync-secrets
```

Without this configuration, the extension's requests to `/events/*` will be **blocked by CORS** (secure by default per ADR 0021).

See [Extension security configuration](#extension-security-configuration) for details.

## Secrets management

**Doppler is the canonical source of truth** for all secrets across all environments.
Secrets are synced from Doppler to Cloudflare Workers at deploy time via GitHub Actions.

- **Local dev**: `.dev.vars` in `packages/api/` (gitignored, synced via `just sync-secrets`)
- **Preview**: Synced from Doppler `apps/prv_append` at deploy time
- **Production**: Synced from Doppler `apps/prd_append` at deploy time

### Doppler configs

| Environment | Doppler Config    | Sync Method                             |
| ----------- | ----------------- | --------------------------------------- |
| Local dev   | `apps/dev_append` | `just sync-secrets` → `.dev.vars`       |
| Preview     | `apps/prv_append` | GitHub Actions → `wrangler secret bulk` |
| Production  | `apps/prd_append` | GitHub Actions → `wrangler secret bulk` |

### Updating secrets

**Local dev:**

```bash
doppler secrets set BETTER_AUTH_URL="http://localhost:8787" --project apps --config dev_append
just sync-secrets
```

**Preview/Production:**

```bash
# Update in Doppler (secrets sync automatically on next deploy)
doppler secrets set <SECRET_NAME> --project apps --config prv_append  # preview
doppler secrets set <SECRET_NAME> --project apps --config prd_append  # production

# To sync immediately without a code change, trigger a deploy manually
```

**Important:** Never use `wrangler secret put` directly — it will be overwritten on the next deploy.

### Extension security configuration

The API restricts `/events/*` access from Chrome extensions using two security measures (ADR 0021):

1. **Extension ID allowlist**: Only specific extension IDs can make CORS requests
2. **Required bearer auth**: Extensions must use device tokens; cookie auth is rejected

**Secure by default**: If `ALLOWED_EXTENSION_IDS` is not set or empty, **all** chrome-extension:// origins are rejected by CORS. This prevents unauthorized extensions from accessing the API.

**Test coverage**: The CORS behavior is verified by integration tests:

- `packages/api/test/cors.spec.ts` — Tests rejection when `ALLOWED_EXTENSION_IDS` is not set
- `packages/api/test/cors.extension.spec.ts` — Tests acceptance when configured (run via `pnpm test:extension`)

#### Local development setup

The local development extension has a stable ID: **`nnhipglpoenbcdonkbnfdcmfcfaggjle`**

This ID is deterministic (generated from the public key in `packages/extension/src/manifest.ts`).

**Required for local extension development**. Configure for local dev:

```bash
# Option 1: Via Doppler (recommended)
doppler secrets set ALLOWED_EXTENSION_IDS="nnhipglpoenbcdonkbnfdcmfcfaggjle" --project apps --config dev_append
just sync-secrets

# Option 2: Manually add to packages/api/.dev.vars
echo 'ALLOWED_EXTENSION_IDS=nnhipglpoenbcdonkbnfdcmfcfaggjle' >> packages/api/.dev.vars
```

#### Production setup (one-time)

When you publish the extension to Chrome Web Store, it gets a **permanent ID** that never changes.

**After first Chrome Web Store publish:**

1. Get the production extension ID from Chrome Web Store developer dashboard or from `chrome://extensions/` after installing the published version

2. Set it in Doppler (one-time):

   ```bash
   doppler secrets set ALLOWED_EXTENSION_IDS="<production-extension-id>" --project apps --config prd_append
   ```

3. Document the production ID in this runbook for reference:

   ```bash
   # Production extension ID: <paste-here-after-publishing>
   ```

**Important**: The production ID only needs to be set **once** when you first publish. It never changes after that, so you don't need to update it on every deploy.

#### Preview environment

For PR previews, use the local dev ID (same stable key):

```bash
doppler secrets set ALLOWED_EXTENSION_IDS="nnhipglpoenbcdonkbnfdcmfcfaggjle" --project apps --config prv_append
```

#### Verifying the extension ID

To confirm your extension ID:

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (toggle in top right)
3. Look for the 32-character ID under the extension name

For the local dev extension, it should always show: `nnhipglpoenbcdonkbnfdcmfcfaggjle`

#### Multiple extensions (if needed)

If you need to allow multiple extensions (e.g., local dev + production):

```bash
ALLOWED_EXTENSION_IDS=nnhipglpoenbcdonkbnfdcmfcfaggjle,<production-id>
```

If unset or empty, all extension requests are rejected (secure by default).

### Listing/verifying secrets

```bash
pnpm wrangler secret list
```

## Auth configuration

Append uses Google SSO with a strict allowlist (ADR 0001). At least one of the
following must be configured, or auth will **fail closed** at runtime:

- `ALLOWED_SUB` (preferred) — Google account `sub`
- `ALLOWED_EMAIL` (fallback) — case-insensitive email, supports wildcard patterns
  for plus-addressing (e.g., `e2e-bot+*@append.test` matches `e2e-bot+pr-123@append.test`)

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
- `DOPPLER_TOKEN_PROD_APPEND` (Doppler service token for production)
- `DOPPLER_TOKEN_PREVIEW_APPEND` (Doppler service token for preview, used in `preview.yml`)
- `E2E_AUTH_SECRET` (for E2E tests in preview workflow)

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

## Publishing Chrome Extension

When publishing the extension to Chrome Web Store for the first time, follow this checklist:

### Pre-publish checklist

1. **Build the production extension** (strips dev key automatically):

   ```bash
   cd packages/extension
   pnpm build:prod
   # Creates release/release.zip ready for upload to Chrome Web Store
   ```

   The `build:prod` command automatically:
   - Runs Vite in production mode (`--mode production`)
   - Excludes the dev `key` field from the manifest via `defineManifest()`
   - Creates a production-ready build that Chrome Web Store will accept

   **Important:** Always use `build:prod` for publishing, not `build` (which includes the dev key for local testing).

### Publishing steps

1. Upload to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

2. **After first publish approval**, get the production extension ID:
   - Install the published extension from Chrome Web Store
   - Open `chrome://extensions/`
   - Copy the 32-character extension ID

3. **Set the extension ID in Doppler** (one-time):

   ```bash
   doppler secrets set ALLOWED_EXTENSION_IDS="<production-extension-id>" --project apps --config prd_append
   ```

4. **Document the production ID** in this runbook:

   ```bash
   # Production extension ID: <paste-production-id-here>
   # (Set on: YYYY-MM-DD)
   ```

5. **Test the published extension**:
   - Install from Chrome Web Store
   - Verify it can connect to production API (`https://api.append.tindev.dev`)
   - Check that event ingestion works

### Important notes

- **The production extension ID never changes** after first publish
- You only need to set `ALLOWED_EXTENSION_IDS` once in Doppler
- No need to update it on every deploy or extension update
- For local development, continue using the stable dev ID: `nnhipglpoenbcdonkbnfdcmfcfaggjle`

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

Preview secrets are managed in Doppler (`apps/prv_append`) and synced automatically at deploy time.

```bash
# View preview secrets in Doppler
doppler secrets --project apps --config prv_append
```

Required secrets (configured in Doppler `apps/prv_append`):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `E2E_AUTH_SECRET`
- `CF_AIG_TOKEN` (optional, preview uses stub AI provider)

### E2E authentication for Playwright (ADR 0019)

Playwright E2E tests should not automate Google login UI flows. Instead, use the
non-production auth bootstrap endpoint:

- `POST /auth/e2e/login` (sets Better Auth session cookies; returns 204)

Preview web runs on `*.pages.dev` while preview API runs on `*.workers.dev`
(`pages.dev` → `workers.dev` is cross-site). To make preview auth work, the API
must allow the preview Pages origin and use preview-only cookie settings per ADR 0019.

Required preview configuration for E2E tests (ADR 0019):

- Secrets (synced from Doppler `apps/prv_append`):
  - `E2E_AUTH_SECRET` — secret required by `x-e2e-secret` header
  - `E2E_AUTH_EMAIL` — set dynamically by preview workflow per PR (e.g., `e2e-bot+pr-123@append.test`)
- Vars (preview Worker) — already configured in `wrangler.jsonc`:
  - `APP_ENV=preview`
  - `ALLOWED_EMAIL=e2e-bot+*@append.test` (wildcard pattern for plus-addressing)
- Allowlist (required for `/auth/e2e/login`):
  - `ALLOWED_EMAIL` supports wildcard patterns for plus-addressing (e.g., `e2e-bot+*@append.test`)
  - `E2E_AUTH_EMAIL` must match the `ALLOWED_EMAIL` pattern (exact match or wildcard)
  - If you also want owner Google access in preview, set `ALLOWED_SUB` to the owner's Google `sub`.

**Per-PR email isolation**: The preview workflow automatically sets `E2E_AUTH_EMAIL` to
`e2e-bot+pr-{PR_NUMBER}@append.test` for each PR. This provides environment isolation
while using a single wildcard allowlist pattern.

**E2E secret setup:**

1. Set in Doppler (synced to Worker at deploy time):

   ```bash
   doppler secrets set E2E_AUTH_SECRET --project apps --config prv_append
   ```

2. Also add `E2E_AUTH_SECRET` to GitHub Actions secrets (for Playwright to use directly).

Note: `E2E_AUTH_EMAIL` is set automatically by the preview workflow — no manual configuration needed.

**Manual preview auth verification (cross-site):**

1. Open the preview Pages URL in a browser and open DevTools console.
2. Run:

   ```js
   await fetch(
    "https://append-api-preview.tindotdev.workers.dev/auth/e2e/login",
    {
     method: "POST",
     headers: { "x-e2e-secret": "<preview E2E_AUTH_SECRET>" },
     credentials: "include",
    },
   );

   await fetch(
    "https://append-api-preview.tindotdev.workers.dev/api/batch?limit=1",
    {
     credentials: "include",
    },
   );
   ```

3. Confirm the second request returns 200 and includes batches (or an empty list).

### Running E2E tests locally

To run Playwright E2E tests against local development servers:

1. Configure secrets in both packages:

   **API** (`packages/api/.dev.vars`):

   ```bash
   E2E_AUTH_SECRET=your-local-e2e-secret-at-least-32-chars
   E2E_AUTH_EMAIL=your-test-email@example.com
   ALLOWED_EMAIL=your-test-email@example.com
   ```

   **Web** (`packages/web/.env` — auto-loaded by Playwright):

   ```bash
   E2E_AUTH_SECRET=your-local-e2e-secret-at-least-32-chars
   ```

   The `E2E_AUTH_SECRET` must match in both files.

2. Ensure `ALLOWED_EMAIL` matches `E2E_AUTH_EMAIL` (exact match or wildcard pattern).

3. Run Playwright tests (starts dev servers automatically):

   ```bash
   cd packages/web
   pnpm test:e2e
   ```

4. For interactive debugging:

   ```bash
   pnpm test:e2e:ui
   ```

### E2E secret rotation

To rotate the E2E secret in preview:

```bash
# Generate a new secret
openssl rand -base64 32

# Update in Doppler (will sync to Worker on next deploy)
doppler secrets set E2E_AUTH_SECRET --project apps --config prv_append

# Update in GitHub Actions secrets
# (manual step in GitHub repository settings)

# Trigger a deploy to sync the new secret (or wait for next PR push)
```

Verify the old secret is rejected:

```bash
curl -i -X POST "https://append-api-preview.tindotdev.workers.dev/auth/e2e/login" \
  -H "x-e2e-secret: <old-secret>"
# Expect HTTP 403
```

Then verify the new secret succeeds (204 + Set-Cookie).

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

### Running all test suites

```bash
# Default tests (includes CORS tests without ALLOWED_EXTENSION_IDS)
pnpm --filter @append/api test

# Preview environment tests (APP_ENV=preview)
pnpm --filter @append/api test:preview

# Extension tests (ALLOWED_EXTENSION_IDS set)
pnpm --filter @append/api test:extension
```

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
