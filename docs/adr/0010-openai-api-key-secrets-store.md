# ADR 0010 — OpenAI API key via Cloudflare Secrets Store

Status: Superseded by ADR 0022
Date: 2025-12-28

Supersedes: ADR 0009 (secret management) and ADR 0006 (secret management)

## Context

The suggestions pipeline calls OpenAI through Cloudflare AI Gateway. The previous
setup used a per-Worker secret (`CF_AIG_TOKEN`) for Unified Billing. We want a
centralized secret that is easier to rotate and can be shared across Workers
without duplicating secrets per environment.

## Decision

- Store the OpenAI API key in **Cloudflare Secrets Store** (account-level).
- Bind the secret into the Worker as `OPENAI_API_KEY` via `secrets_store_secrets`
  in `packages/api/wrangler.jsonc`.
- Retrieve the key asynchronously at runtime via `env.OPENAI_API_KEY.get()`.
- Remove the per-Worker `CF_AIG_TOKEN` secret from the configuration contract.

## Consequences

- One key rotation updates all Workers using the binding.
- Deployments must have access to the Secrets Store binding in Cloudflare.
- Local dev can either create a local Secrets Store secret or run with
  `SUGGESTIONS_PROVIDER=stub`.

## Alternatives considered

- Keep per-Worker secrets with `wrangler secret put`.
- Continue using AI Gateway Unified Billing (`CF_AIG_TOKEN`).
