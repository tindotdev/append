# Append — Build plan (milestones)

## Current stage

- Vertical slice steps 1–7 are complete and archived (see `docs/archive/vertical-slice.md`).
- **Phase 5 (Custom Buckets + Hono RPC)**: Phases 5A–5D complete. Remaining: 5E (testing + docs).
- **Milestone 4 (Import ENG-LOG)**: Complete. See `docs/qa-import-checklist.md` for QA results.
- Next: Milestone 5 (Explain It Myself feedback loop).

## Milestone 1 — Canonical log entries (no AI, no import)

- Google SSO login.
- Create/view bucket feeds.
- Manual add sense (term + text + bucket).
- If term already exists: add another sense (append-only), optionally flagged.
- Basic search (term + sense text).

## Milestone 2 — Capture batches + accept flow (no AI)

- Capture batch (paste many terms).
- Edit candidate fields.
- Accept/accept-all → materialize as Term + Sense (idempotent; duplicates attach as new senses).

## Milestone 3 — AI suggestions (Case 1)

- Generate suggestions for a batch.
- Per-item accept/edit; accept-all.
- Cost controls (batch size limits, caching by normalized term).

## Milestone 4 — Import ENG-LOG markdown (migration) ✅

- Upload/paste markdown files via FilePond drag-drop. ✅
- Parse → preview (diff/stats) → commit import (idempotent). ✅
- Dedupe policy: exact duplicates attach as new senses and are flagged if bucket differs. ✅
- Files stored in Cloudflare R2 for audit trail. ✅
- **Deferred**: Import history UI (list past imports) — see backlog.

## Milestone 5 — “Explain it myself” feedback loop (Case 2)

- Add explanation entries per term (one-liner/analogy/pseudocode).
- LLM grader feedback (correct/unclear/wrong + brief guidance).
- Track iterations as append-only explanation attempts.

## Phase 5 — Custom Buckets + Hono RPC (infrastructure)

- **5A**: Hono RPC setup (type-safe API client via `hc<AppType>`). ✅
- **5B**: Bucket table schema + migration. ✅
- **5C**: Bucket CRUD API (list, create, update, delete, reorder). ✅
- **5D**: Bucket Manager UI (settings page, drag-drop reorder). ✅
- **5E**: Testing + docs (user-bucket tests, documentation refresh). In progress.

See ADRs: `0012-custom-user-buckets.md`, `0013-hono-rpc-type-sharing.md`, `0014-module-boundaries-platform-types.md`.

## Implementation note

- Stack: SPA (React + TanStack Router) hosted on Cloudflare Pages + Hono API on Cloudflare Workers (ADR: `docs/adr/0004-spa-hono-workers.md`).
- Type sharing: Hono RPC for end-to-end type safety (ADR: `docs/adr/0013-hono-rpc-type-sharing.md`).
- Module boundaries: `lib` cannot depend on `platform`; shared types live in `shared` (ADR: `docs/adr/0014-module-boundaries-platform-types.md`).
