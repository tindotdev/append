# Append — Risk register

## Correctness risks

- Duplicate log entries on retries (accept-all/import).
  - Mitigation: idempotency keys + transactional accept/import.
- Duplicate term spam across history (“CRDT” x5).
  - Mitigation: unique canonical `Term`, store duplicates as `TermSense` attachments; flag bucket conflicts for review.
- Silent overwrites from multi-device usage.
  - Mitigation: optimistic locking on candidate edits.
- Import ambiguity (non-bullets, multi-line bullets, malformed markdown).
  - Mitigation: preview step + explicit “skip/convert” rules.

## Complexity risks

- OAuth integration pitfalls (redirects, environments, provider config).
  - Mitigation: start with Google-only; keep auth surface small.
- Client/server type drift (SPA ↔ Worker API).
  - Mitigation: optional Hono RPC or shared type package; keep API surface small early.
- Scope creep on “code explanation” and transcription.
  - Mitigation: ship text-only explanations first; add audio later as a separate milestone.

## Operational risks

- LLM costs and rate limits with large batches.
  - Mitigation: hard batch limits, per-term caching, partial results, backoff.
- Data growth (years of entries).
  - Mitigation: cheap indexes, cursor pagination, optional FTS later.
