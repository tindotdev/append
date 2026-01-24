#!/usr/bin/env bash
set -euo pipefail

# Sync secrets from Doppler to production Worker and verify required secrets exist
# Usage: ./sync-secrets-prod.sh
# Requires: DOPPLER_TOKEN env var OR doppler login session

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_DIR="$REPO_ROOT/packages/api"

echo "🔐 Syncing secrets from Doppler to production Worker..."

# Check if we have Doppler access (either via DOPPLER_TOKEN or logged in session)
if [ -z "${DOPPLER_TOKEN:-}" ]; then
  echo "ℹ️  No DOPPLER_TOKEN set, checking for active Doppler session..."
  if ! doppler whoami &>/dev/null; then
    echo "❌ Error: Not authenticated with Doppler. Run 'doppler login' or set DOPPLER_TOKEN"
    exit 1
  fi
  echo "✓ Using Doppler CLI session"
else
  echo "✓ Using DOPPLER_TOKEN from environment"
fi

cd "$API_DIR"

# Sync all secrets from Doppler (project: apps, config: prd_append) to Cloudflare Worker
# Filter out DOPPLER_* env vars as they're metadata, not secrets
echo "Syncing secrets from Doppler (project: apps, config: prd_append)..."

set +e
doppler secrets download \
  --project apps \
  --config prd_append \
  --format json \
  --no-file | \
  jq -c 'with_entries(.value = .value.computed) | del(.DOPPLER_PROJECT, .DOPPLER_CONFIG, .DOPPLER_ENVIRONMENT, .DOPPLER_ENVIRONMENT_SLUG, .DOPPLER_PROJECT_NAME, .DOPPLER_CONFIG_NAME)' | \
  pnpm exec wrangler secret bulk --env production --config wrangler.jsonc

SYNC_EXIT_CODE=$?
set -e

if [ $SYNC_EXIT_CODE -ne 0 ]; then
  echo "❌ Error: Secret sync failed. Check that the Worker exists and you have permissions."
  exit 1
fi

echo "✓ Secrets synced to production Worker"

# Verify required secrets exist (names only, not values)
echo ""
echo "🔍 Verifying required secrets are present..."

SECRETS_JSON="$(pnpm exec wrangler secret list --format json --env production --config wrangler.jsonc)"
export SECRETS_JSON

python3 - <<'PY'
import json
import os
import sys

required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "BETTER_AUTH_SECRET",
    "OPENAI_API_KEY",
]

# At least one allowlist mechanism must be configured
allowlist = ["ALLOWED_SUB", "ALLOWED_EMAIL"]

secrets = json.loads(os.environ["SECRETS_JSON"])
names = {s.get("name") for s in secrets if isinstance(s, dict)}

missing = [name for name in required if name not in names]
if missing:
    print(f"❌ Error: Missing required Worker secrets: {', '.join(missing)}")
    sys.exit(1)

# Check that at least one allowlist secret exists
allowlist_present = [name for name in allowlist if name in names]
if not allowlist_present:
    print(f"❌ Error: Missing allowlist configuration. At least one of {', '.join(allowlist)} must be present")
    sys.exit(1)

print("✓ All required Worker secrets are present")
print(f"✓ Allowlist configured: {', '.join(allowlist_present)}")
PY

echo ""
echo "✅ Secret sync and verification complete"
