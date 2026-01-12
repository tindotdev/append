# ADR 0022 — Doppler as canonical source of truth for secrets

Status: Accepted
Date: 2025-01-12

Supersedes: ADR 0010 (OpenAI API key via Cloudflare Secrets Store)

## Context

We had multiple secret management approaches:
- Local dev: Doppler (`apps/dev_append`) synced to `.dev.vars`
- Production: Cloudflare Secrets Store for `OPENAI_API_KEY`, `wrangler secret put` for others
- Preview: Manual `wrangler secret put` commands

This fragmentation made secret rotation error-prone and required touching multiple systems.

## Decision

Make **Doppler the single source of truth** for all secrets across all environments:

- **Local dev**: `apps/dev_append` → synced via `just sync-secrets` to `.dev.vars`
- **Preview**: `apps/prv_append` → synced at deploy time via GitHub Actions
- **Production**: `apps/prd_append` → synced at deploy time via GitHub Actions

Secrets are synced from Doppler to Cloudflare Workers using (env-scoped):
```bash
doppler secrets download --no-file --format json > /tmp/worker-secrets.json
wrangler secret bulk --env <env> < /tmp/worker-secrets.json
```

Remove Cloudflare Secrets Store binding for `OPENAI_API_KEY` — it becomes a regular Worker secret synced from Doppler like all others.

## Consequences

- **Single rotation point**: Update secret in Doppler → deploy triggers sync
- **Audit trail**: Doppler provides secret access logs and version history
- **Consistency**: Same workflow for all secrets, all environments
- **GitHub Actions secrets**: Require `DOPPLER_TOKEN_PREVIEW_APPEND` and `DOPPLER_TOKEN_PROD_APPEND` service tokens
- **Never edit Cloudflare directly**: Worker secrets will be overwritten on next deploy

## Exceptions: E2E_AUTH_EMAIL

**`E2E_AUTH_EMAIL` is intentionally excluded from Doppler** and set dynamically by the preview workflow per pull request (see ADR 0019).

Rationale:
- E2E tests need per-PR email isolation (e.g., `e2e-bot+pr-123@append.test`) to prevent cross-PR test pollution
- The email pattern must match the allowlist (`ALLOWED_EMAIL=e2e-bot+*@append.test`) but vary by PR
- Setting it in Doppler would create a static value unsuitable for per-PR test environments

**`E2E_AUTH_EMAIL` is set by**: `.github/workflows/preview.yml` step "Set PR-specific E2E auth email" (after Doppler sync).

This is the only exception to the "Doppler is canonical" rule. All other secrets follow the standard Doppler workflow.

## Migration

1. Import existing secrets into Doppler configs (`prv_append`, `prd_append`)
2. Create read-only Doppler service tokens for CI/CD
3. Store tokens in GitHub Actions secrets
4. Update workflows to sync from Doppler before deploy
5. Remove `secrets_store_secrets` binding from `wrangler.jsonc`
