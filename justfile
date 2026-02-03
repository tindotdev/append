# Prerequisites:
# - Doppler CLI installed (https://docs.doppler.com/docs/install-cli)
# - Authenticated via `doppler login`
# - Node.js, pnpm, just installed

# Show all available commands
help:
  @just --list

# Sync secrets from Doppler to .dev.vars (run after updating secrets in Doppler)
sync-secrets:
  @echo "Syncing secrets from Doppler (project: apps, config: dev_append)..."
  @doppler secrets download --project apps --config dev_append --no-file --format env | grep -v '^DOPPLER_' > packages/api/.dev.vars
  @echo "Adding local dev configuration overrides..."
  @echo '' >> packages/api/.dev.vars
  @echo '# Local development configuration (not secrets, managed in justfile)' >> packages/api/.dev.vars
  @echo '# NOTE: These are developer-specific values for solo-dev convenience.' >> packages/api/.dev.vars
  @echo '# New contributors should update ALLOWED_EMAIL and E2E_AUTH_EMAIL to their own email.' >> packages/api/.dev.vars
  @echo '# See ADR 0022 for exceptions to Doppler-canonical-secrets policy.' >> packages/api/.dev.vars
  @echo 'APP_ENV="local"' >> packages/api/.dev.vars
  @echo 'BETTER_AUTH_URL="http://localhost:8787"' >> packages/api/.dev.vars
  @echo 'ALLOWED_EMAIL="tindejphachon@gmail.com"' >> packages/api/.dev.vars
  @echo 'ALLOWED_EXTENSION_IDS="nnhipglpoenbcdonkbnfdcmfcfaggjle"' >> packages/api/.dev.vars
  @echo 'ENABLE_TEST_EMAIL_PASSWORD_AUTH="1"' >> packages/api/.dev.vars
  @echo 'E2E_AUTH_EMAIL="tindejphachon@gmail.com"' >> packages/api/.dev.vars
  @echo 'GOOGLE_CLIENT_ID="888108815812-edd7uq5bo4isrl7uuh4dhsbr7df4jtl5.apps.googleusercontent.com"' >> packages/api/.dev.vars
  @echo "✓ Secrets synced and local dev config applied"

# First-time setup: install deps, sync secrets, run migrations
# Run this on a new machine after cloning the repo
setup: sync-secrets
  @echo "Installing dependencies and running migrations..."
  pnpm setup:deps
  @echo "✓ Setup complete! Run 'just dev' to start development servers"

# Start development servers (auto-syncs secrets if .dev.vars is missing)
# Starts: API (http://localhost:8787), Web (http://localhost:5173), Extension (port 5174)
dev:
  #!/usr/bin/env bash
  if [ ! -f packages/api/.dev.vars ]; then
    echo "⚠️  .dev.vars not found, syncing secrets from Doppler..."
    just sync-secrets
  fi
  doppler run -- pnpm dev:nosecrets

# Run full CI pipeline (matches GitHub Actions)
ci:
  @echo "Running full CI pipeline..."
  pnpm run ci

# Run CI with preview tests
ci-all:
  @echo "Running full CI pipeline with preview tests..."
  pnpm run ci:all

# Run fast CI for inner loop (boundaries, docs, typecheck only)
ci-fast:
  @echo "Running fast CI checks..."
  pnpm run ci:fast

# Run tests in watch mode
test-watch:
  @echo "Running tests in watch mode..."
  pnpm test:watch

# Run typecheck in watch mode
typecheck-watch:
  @echo "Running typecheck in watch mode..."
  pnpm -r --parallel --if-present typecheck --watch

# Format and lint changed files only (fast)
changed:
  @echo "Checking changed files..."
  git diff --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx|js|jsx|json|jsonc|css)$' | xargs -r pnpm exec biome check --write --files-ignore-unknown=true --no-errors-on-unmatched || echo "No changed files to check"

# Sync secrets from Doppler to production Worker (and verify)
secrets-prod:
  @bash scripts/deploy/sync-secrets-prod.sh

# Deploy to production (runs CI first unless SKIP_CHECKS=1, requires confirmation unless SKIP_CONFIRMATION=1)
deploy:
  #!/usr/bin/env bash
  SKIP_CHECKS="${SKIP_CHECKS:-0}"
  SKIP_CONFIRMATION="${SKIP_CONFIRMATION:-0}"
  bash scripts/deploy/deploy-prod.sh \
    $([ "$SKIP_CHECKS" = "1" ] && echo "--skip-checks" || echo "") \
    $([ "$SKIP_CONFIRMATION" = "1" ] && echo "--skip-confirmation" || echo "")
