#!/usr/bin/env bash
set -euo pipefail

# Deploy to production (API Worker + Web Pages)
# Usage: ./deploy-prod.sh [--skip-checks] [--skip-confirmation]
# Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
# Requires: DOPPLER_TOKEN env var OR doppler login session

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_DIR="$REPO_ROOT/packages/api"
WEB_DIR="$REPO_ROOT/packages/web"

SKIP_CHECKS="${SKIP_CHECKS:-0}"
SKIP_CONFIRMATION="${SKIP_CONFIRMATION:-0}"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --skip-checks)
      SKIP_CHECKS=1
      shift
      ;;
    --skip-confirmation)
      SKIP_CONFIRMATION=1
      shift
      ;;
  esac
done

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  PRODUCTION DEPLOYMENT                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Guardrail: Verify Cloudflare authentication (OAuth or API token)
echo "🔍 Verifying Cloudflare authentication..."
WHOAMI_OUTPUT="$(cd "$API_DIR" && pnpm exec wrangler whoami 2>&1 || true)"

if echo "$WHOAMI_OUTPUT" | grep -q "You are logged in with an OAuth Token"; then
  echo "✓ Authenticated with OAuth (wrangler login)"
  # OAuth authentication - no env vars needed
elif echo "$WHOAMI_OUTPUT" | grep -q "You are logged in"; then
  echo "✓ Authenticated with API token"
  # API token authentication - verify env vars are set
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "⚠️  Warning: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID not set"
    echo "   Authentication may work via wrangler credentials, but setting env vars is recommended for CI/CD"
  fi
else
  echo "❌ Error: Wrangler authentication failed"
  echo "Please run 'wrangler login' or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"
  echo ""
  echo "Output from wrangler whoami:"
  echo "$WHOAMI_OUTPUT"
  exit 1
fi
echo ""

# Guardrail: Require explicit confirmation for production deploy
if [ "$SKIP_CONFIRMATION" != "1" ]; then
  echo "⚠️  You are about to deploy to PRODUCTION"
  echo ""
  echo "This will:"
  echo "  1. Sync secrets from Doppler to production Worker"
  echo "  2. Apply database migrations to production D1"
  echo "  3. Deploy API Worker to production"
  echo "  4. Deploy web app to production Pages"
  echo ""
  read -p "Continue? (yes/no): " -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Deployment cancelled"
    exit 0
  fi
fi

# Step 1: Run CI checks (unless explicitly skipped)
if [ "$SKIP_CHECKS" != "1" ]; then
  echo "1️⃣  Running CI checks..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd "$REPO_ROOT"
  pnpm run ci
  echo ""
  echo "✓ CI checks passed"
  echo ""
else
  echo "⚠️  Skipping CI checks (SKIP_CHECKS=1)"
  echo ""
fi

# Step 2: Sync secrets from Doppler to production Worker
echo "2️⃣  Syncing secrets to production Worker..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bash "$SCRIPT_DIR/sync-secrets-prod.sh"
echo ""

# Step 3: Apply D1 migrations to production
echo "3️⃣  Applying database migrations to production..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$API_DIR"
pnpm exec wrangler d1 migrations apply append-db --remote --env production --config wrangler.jsonc
echo ""
echo "✓ Database migrations applied"
echo ""

# Step 4: Deploy Worker API to production
echo "4️⃣  Deploying API Worker to production..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$API_DIR"
pnpm run deploy -- --env production --config wrangler.jsonc
echo ""
echo "✓ API Worker deployed"
echo ""

# Step 5: Build web with production API URL
echo "5️⃣  Building web app for production..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$WEB_DIR"
VITE_API_URL=https://api.append.tindev.dev pnpm run build
echo ""
echo "✓ Web app built"
echo ""

# Step 6: Deploy web to Pages (production)
echo "6️⃣  Deploying web app to Pages (production)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$WEB_DIR"
# Omit --branch to deploy to Production (required for custom domains)
pnpm exec wrangler pages deploy dist --project-name "append-web"
echo ""
echo "✓ Web app deployed"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║             ✅ PRODUCTION DEPLOYMENT COMPLETE                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Production URLs:"
echo "  • API:  https://api.append.tindev.dev"
echo "  • Web:  https://append.tindev.dev"
echo ""
