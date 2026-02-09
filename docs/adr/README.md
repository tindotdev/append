# Architecture Decision Records

This folder stores append-only decisions with rationale.

## Rules

Prefer adding new ADRs over editing old ones. If a decision changes, add a new ADR and mark the old one superseded. Keep `docs/design.md` as the current snapshot and link to ADRs for context.

## Index

### Active

- 0004: SPA (React + TanStack Router) + Hono on Workers (no SSR)
- 0006: OpenAI `gpt-5-mini` via Cloudflare AI Gateway
- 0009: Vercel AI SDK with SSE streaming for suggestions
- 0011: Parallel suggestion generation with concurrency=10
- 0013: Hono RPC replaces contracts package for API type sharing
- 0014: Module boundary: `lib` must not depend on `platform`
- 0015: Linear-style sidebar navigation replacing header nav
- 0016: Capture page term composer with local-only draft persistence
- 0018: Outbox-backed capture semantics (queue now, open later, undo)
- 0019: E2E auth bootstrap endpoint for preview + Playwright (non-prod only)
- 0020: Events-first learning telemetry (WakaTime-for-learning)
- 0021: Extension auth via device tokens (bearer)
- 0022: M1 dashboard read models + raw events export
- 0023: Term archival + bulk actions (delete/move)
- 0024: Accept individual candidates with data table UI
- 0025: Public auth with AUTH_MODE switch + telemetry access separation
- 0026: Per-user lifetime quotas (3) + global monthly budget
- 0027: Indefinite retention by default + hard delete on account deletion
- 0028: Doppler as canonical source of truth for secrets

### Superseded

_(Moved to `superseded/` subdirectory)_

- 0001: Google SSO with allowlist (see 0025)
- 0002: Duplicate handling via `Term` + `TermSense` (see 0020)
- 0003: Bucket feed shows primary sense by default (see 0020)
- 0005: Web auth gating via protected layout route (see 0015)
- 0007: Step 3 suggestions stored on `candidate` + per-term cache (see 0020)
- 0008: Accept-all idempotency via candidate materialization pointers (see 0020)
- 0010: OpenAI API key stored in Cloudflare Secrets Store (see 0028)
- 0012: User-owned dynamic buckets (see 0020)
- 0017: Term + TermSense edits with optimistic locking (see 0020)
