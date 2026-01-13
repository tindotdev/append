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
  @echo 'APP_ENV="local"' >> packages/api/.dev.vars
  @echo 'BETTER_AUTH_URL="http://localhost:8787"' >> packages/api/.dev.vars
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
