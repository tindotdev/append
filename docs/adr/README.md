# Architecture Decision Records (ADRs)

This folder stores **append-only decisions + rationale**.

Rules:

- Prefer adding a new ADR over editing old ones.
- If a decision changes, add a new ADR and mark the old one **Superseded**.
- Keep `docs/design.md` as the “current snapshot” and link to ADRs for the why.

## Index

- `0001-google-allowlist-auth.md` — Google SSO with allowlist (sub-first, email fallback)
- `0002-term-sense-duplicates.md` — Duplicate handling via `Term` + `TermSense` (allowed-but-flagged) _(Superseded by 0020)_
- `0003-bucket-feed-primary-sense.md` — Bucket feed shows primary sense by default (expand for more; review mode) _(Superseded by 0020)_
- `0004-spa-hono-workers.md` — SPA (React + TanStack Router) + Hono on Workers (no SSR)
- `0005-web-auth-gating-protected-layout.md` — Web auth gating via protected layout route _(Superseded by 0015 for UI implementation)_
- `0006-openai-gpt-5-mini-via-ai-gateway.md` — OpenAI `gpt-5-mini` via Cloudflare AI Gateway
- `0007-step-3-suggestions-on-candidate-plus-cache.md` — Step 3 suggestions stored on `candidate` + per-term cache _(Superseded by 0020)_
- `0008-accept-all-idempotency-via-candidate-materialization-pointers.md` — Accept-all idempotency via candidate materialization pointers _(Superseded by 0020)_
- `0009-vercel-ai-sdk-with-streaming.md` — Vercel AI SDK with SSE streaming for suggestions
- `0010-openai-api-key-secrets-store.md` — OpenAI API key stored in Cloudflare Secrets Store
- `0011-parallel-suggestion-generation.md` — Parallel suggestion generation with concurrency=10
- `0012-custom-user-buckets.md` — User-owned dynamic buckets (replacing static hardcoded buckets) _(Superseded by 0020)_
- `0013-hono-rpc-type-sharing.md` — Hono RPC replaces contracts package for API type sharing
- `0014-module-boundaries-platform-types.md` — Module boundary: `lib` must not depend on `platform`
- `0015-web-ui-linear-sidebar-layout.md` — Linear-style sidebar navigation replacing header nav (supersedes 0005 for UI)
- `0016-web-ui-capture-term-composer.md` — Capture page term composer with local-only draft persistence
- `0017-term-and-term-sense-editing.md` — Term + TermSense edits with optimistic locking _(Superseded by 0020)_
- `0018-outbox-backed-capture-semantics.md` — Outbox-backed capture semantics (queue now, open later, undo)
- `0019-e2e-auth-bootstrap-preview.md` — E2E auth bootstrap endpoint for preview + Playwright (non-prod only)
- `0020-events-first-learning-telemetry.md` — Events-first learning telemetry (WakaTime-for-learning)
- `0021-extension-device-token-auth.md` — Extension auth via device tokens (bearer)
- `0022-m1-dashboard-read-models-and-export.md` — M1 dashboard read models + raw events export
- `0023-term-archival-and-bulk-actions.md` — Term archival + bulk actions (delete/move)
- `0024-accept-individual-candidates.md` — Accept individual candidates with data table UI
