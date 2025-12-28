# Architecture Decision Records (ADRs)

This folder stores **append-only decisions + rationale**.

Rules:

- Prefer adding a new ADR over editing old ones.
- If a decision changes, add a new ADR and mark the old one **Superseded**.
- Keep `docs/design.md` as the “current snapshot” and link to ADRs for the why.

## Index

- `0001-google-allowlist-auth.md` — Google SSO with allowlist (sub-first, email fallback)
- `0002-term-sense-duplicates.md` — Duplicate handling via `Term` + `TermSense` (allowed-but-flagged)
- `0003-bucket-feed-primary-sense.md` — Bucket feed shows primary sense by default (expand for more; review mode)
- `0004-spa-hono-workers.md` — SPA (React + TanStack Router) + Hono on Workers (no SSR)
- `0005-web-auth-gating-protected-layout.md` — Web auth gating via protected layout route
- `0006-openai-gpt-5-mini-via-ai-gateway.md` — OpenAI `gpt-5-mini` via Cloudflare AI Gateway
- `0007-step-3-suggestions-on-candidate-plus-cache.md` — Step 3 suggestions stored on `candidate` + per-term cache
- `0008-accept-all-idempotency-via-candidate-materialization-pointers.md` — Accept-all idempotency via candidate materialization pointers
- `0009-vercel-ai-sdk-with-streaming.md` — Vercel AI SDK with SSE streaming for suggestions
