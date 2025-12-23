# ADR 0006 — OpenAI `gpt-5-mini` via Cloudflare AI Gateway

Status: Accepted
Date: 2025-12-23

## Context

Append needs an LLM for Step 3 (“suggest bucket + one-liner”) and later milestones.

Constraints and goals:

- Runtime is Cloudflare Workers (Hono).
- We want a single default model for the app to keep behavior predictable.
- We want basic production hygiene (visibility into usage/cost, and an easy place to add controls later) without adding queues/workflows in the vertical slice.

## Decision

- Provider: **OpenAI**
- Default model: **`gpt-5-mini`**
- Request path: **Worker → Cloudflare AI Gateway → OpenAI**
- API interface: OpenAI **Responses API** (non-streaming) for Step 3.

Configuration contract:

- Worker secret: `OPENAI_API_KEY`
- Worker vars: `CF_ACCOUNT_ID`, `AI_GATEWAY_ID`
- AI Gateway OpenAI base URL:
  - `https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{AI_GATEWAY_ID}/openai`
  - Step 3 uses the AI Gateway OpenAI Responses endpoint:
    - `https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{AI_GATEWAY_ID}/openai/responses`

AI Gateway authentication mode (explicit):

- The gateway is configured as **unauthenticated** for this app.
- Requests include the OpenAI key in the normal provider header:
  - `Authorization: Bearer ${OPENAI_API_KEY}`

Operational posture for Step 3:

- No streaming required.
- No app-level rate limiting in Step 3; AI Gateway is the control plane where rate limits can be added if needed.
- No prompt/response caching in AI Gateway for Step 3; caching is implemented at the application layer (see ADR 0007).

## Consequences

- Centralized observability for external LLM calls (AI Gateway).
- Consistent model choice across the app (“`gpt-5-mini` everywhere”).
- Adds a Cloudflare product dependency (AI Gateway) to the request path.

## Alternatives considered

- Call OpenAI directly from the Worker (plain `fetch`): simplest code path, but loses AI Gateway control/visibility.
- Use Workers AI: Cloudflare-hosted models, but the requirement is OpenAI GPT family models.
- Use OpenAI SDK in the Worker: ergonomic, but still needs separate operational guardrails (and doesn’t replace Gateway controls).
