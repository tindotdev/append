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

Secrets are synced from Doppler to Cloudflare Workers using:
```bash
doppler secrets download --no-file --format json | wrangler secret bulk
```

Remove Cloudflare Secrets Store binding for `OPENAI_API_KEY` — it becomes a regular Worker secret synced from Doppler like all others.

## Consequences

- **Single rotation point**: Update secret in Doppler → deploy triggers sync
- **Audit trail**: Doppler provides secret access logs and version history
- **Consistency**: Same workflow for all secrets, all environments
- **GitHub Actions secrets**: Require `DOPPLER_TOKEN_PREVIEW_APPEND` and `DOPPLER_TOKEN_PROD_APPEND` service tokens
- **Never edit Cloudflare directly**: Worker secrets will be overwritten on next deploy

## Migration

1. Import existing secrets into Doppler configs (`prv_append`, `prd_append`)
2. Create read-only Doppler service tokens for CI/CD
3. Store tokens in GitHub Actions secrets
4. Update workflows to sync from Doppler before deploy
5. Remove `secrets_store_secrets` binding from `wrangler.jsonc`
