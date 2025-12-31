# Append — Risk register

## Correctness risks

- Duplicate log entries on retries (accept-all/import).
  - Mitigation: idempotency keys + transactional accept/import.
- Duplicate term spam across history (“CRDT” x5).
  - Mitigation: unique canonical `Term`, store duplicates as `TermSense` attachments; flag bucket conflicts for review.
- Silent overwrites from multi-device usage.
  - Mitigation: optimistic locking on candidate edits.
- Refactor regressions while consolidating slice flows (accept/suggest/edit contracts drift).
  - Mitigation: re-run vertical-slice checks, keep API contracts in `docs/archive/vertical-slice.md` in sync, add targeted tests for edits/accept-all.
- Import ambiguity (non-bullets, multi-line bullets, malformed markdown).
  - Mitigation: preview step + explicit "skip/convert" rules.
- LLM returns invalid bucket slug (not in user's bucket list).
  - Mitigation: server validates suggested_bucket against user's bucket slugs; fallback to first bucket if invalid.

## Complexity risks

- OAuth integration pitfalls (redirects, environments, provider config).
  - Mitigation: start with Google-only; keep auth surface small.
- Client/server type drift (SPA ↔ Worker API).
  - Mitigation: optional Hono RPC or shared type package; keep API surface small early.
- UI refresh scope creep during review pass.
  - Mitigation: track changes against vertical-slice UI contracts; defer new features to a milestone.
- Scope creep on “code explanation” and transcription.
  - Mitigation: ship text-only explanations first; add audio later as a separate milestone.

## Operational risks

- LLM costs and rate limits with large batches.
  - Mitigation: hard batch limits, per-term caching, partial results, backoff.
- Data growth (years of entries).
  - Mitigation: cheap indexes, cursor pagination, optional FTS later.
