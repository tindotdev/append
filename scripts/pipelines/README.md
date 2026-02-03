# CI/CD Pipeline Documentation

## Philosophy

**Local scripts are the canonical pipeline.** Both developers and CI run the same scripts to ensure parity and prevent drift.

## CI Parity Table

| GitHub Actions Step | Local Command | Notes |
|-------------------|---------------|-------|
| **CI Workflow** | | |
| Boundaries lint | `pnpm lint:boundaries` | Enforces architectural boundaries |
| Docs policy | `pnpm docs:policy` | Checks documentation completeness |
| Biome lint (CI mode) | `pnpm ci:lint` | Read-only lint check (no writes) |
| Typecheck | `pnpm typecheck` | Type-checks all packages |
| Tests | `pnpm test` | Runs all unit tests |
| Preview tests | `pnpm --filter @append/api test:preview` | Tests preview environment config |
| Extension tests | `pnpm --filter @append/api test:extension` | Tests VS Code extension integration |
| **Full CI** | `pnpm run ci` or `just ci` | Runs all CI checks in sequence |
| **Auto-Format** | | |
| Format + lint | `pnpm check` | Biome format + lint (writes fixes) |
| **Deploy Workflow** | | |
| Sync secrets | `just secrets-prod` | Syncs Doppler → Cloudflare Worker |
| Verify secrets | (included in deploy) | Validates required secret names exist |
| Apply D1 migrations | (included in deploy) | Applies database migrations to production |
| Deploy API | (included in deploy) | Deploys Worker to production |
| Deploy Web | (included in deploy) | Builds + deploys Pages to production |
| **Full Deploy** | `just deploy` | Runs CI + deploys API + web to production |

## Available Commands

### CI Commands

```bash
# Full CI pipeline (matches GitHub Actions)
pnpm run ci
just ci

# CI with preview tests included
pnpm run ci:all
just ci-all

# Fast CI for inner loop (skips slower checks)
pnpm run ci:fast
just ci-fast
```

### Formatting/Linting

```bash
# Format + lint with auto-fix (what pre-commit does)
pnpm check

# Lint only (CI mode - no writes)
pnpm ci:lint

# Format changed files only (fast)
just changed
```

### Testing

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch
just test-watch

# Run specific package tests
pnpm --filter @append/api test
pnpm --filter @append/web test
```

### Type-checking

```bash
# Typecheck all packages
pnpm typecheck

# Typecheck in watch mode
just typecheck-watch
```

### Deploy Commands

```bash
# Full production deploy (runs CI first, requires confirmation)
just deploy

# Deploy without CI checks (use with caution)
SKIP_CHECKS=1 just deploy

# Sync secrets only
just secrets-prod
```

## Pre-commit Hooks

Configured via [prek](https://github.com/j178/prek) in `.pre-commit-config.yaml`:

- **pre-commit**: Format/lint staged files (Biome), check boundaries, verify docs policy
- **pre-push**: Run `pnpm run ci` before pushing (full CI)

## Secrets Management

**Doppler is the canonical source of truth for secrets.**

### Local Development

```bash
# Sync secrets to .dev.vars (for local API dev)
just sync-secrets
```

Pulls from Doppler `apps/dev_append` config and writes to `packages/api/.dev.vars` (gitignored).

### Production Deployment

```bash
# Sync secrets to production Worker
just secrets-prod
```

Requires either:
- Interactive: `doppler login` + CLI session
- Service token: `DOPPLER_TOKEN=<token>` environment variable

Syncs all secrets from Doppler `apps/prd_append` config to Cloudflare Worker secrets.

## Cloudflare Configuration (Local-Only Deploy)

### Pages (web)

- **No Git integration**: Direct uploads via `wrangler pages deploy`
- Automatic deployments are disabled

### Workers (API)

- **No Git integration**: Direct deploys via `wrangler deploy`
- Automatic deployments are disabled

All production deployments happen via local `just deploy` command only.

## GitHub Actions Status

| Workflow | Status | Notes |
|----------|--------|-------|
| `.github/workflows/claude.yml` | Active | Responds to @claude mentions in issues/PRs |
| `.github/workflows/ci.yml` | **Disabled** | Replaced by pre-push hook + `just ci` |
| `.github/workflows/auto-format.yml` | **Disabled** | Replaced by pre-commit hook |
| `.github/workflows/deploy.yml` | **Disabled** | Replaced by `just deploy` |
| `.github/workflows/preview.yml` | **Disabled** | Preview environment disabled |

## Migration Notes

### Removed Preview Environment

The preview environment has been removed to reduce maintenance overhead:

- Removed `[env.preview]` from `packages/api/wrangler.jsonc`
- Removed preview Cloudflare resources (Worker, D1, R2)
- Removed Doppler `apps/prv_append` config
- Removed `test:preview` from default CI pipeline (available in `ci:all` if needed)

### Why Local-First?

For single-developer workflows:

- **Faster feedback**: No waiting for GitHub Actions
- **Consistent environment**: Same scripts locally and in CI
- **Simpler debugging**: Issues reproduce locally
- **Lower cost**: Fewer CI minutes used
- **More control**: Deploy when ready, not on every merge

The local scripts are designed to be the source of truth, with CI as an optional safety net.
