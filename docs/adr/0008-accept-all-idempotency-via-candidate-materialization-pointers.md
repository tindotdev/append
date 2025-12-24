# ADR 0008 — Accept-all idempotency via candidate materialization pointers

Status: Accepted
Date: 2025-12-23

## Context

The vertical slice requires accept-all to be retry-safe (“re-running accept-all creates zero duplicates”).

Creating `term_sense` rows is append-only and has no natural unique constraint, so retries can easily create duplicates unless we record per-candidate “already materialized” state.

We also want accept-all to be safe even if the client retries with a different idempotency key (e.g., app reload) and even if the original request partially succeeded.

## Decision

- Add materialization pointers on `candidate`:
  - `materialized_term_id` (nullable)
  - `materialized_term_sense_id` (nullable)
- Accept-all writes these pointers when it successfully creates (or attaches) a `term_sense` for that candidate.
- Accept-all must skip any candidate where `materialized_term_sense_id` is already set.

Idempotency posture:

- `POST /api/batch/:id/accept` still requires `clientRequestId` (UUID) and records an idempotency key for replay of the response.
- Even if a different `clientRequestId` is used, accept-all remains safe because already-materialized candidates are skipped using the pointers.

## Consequences

- Retries (same or different `clientRequestId`) do not create duplicate `term_sense` rows.
- Partial success is safe: a second call resumes where the first left off.
- Candidate records become the durable link between a captured candidate and the canonical log entries it produced.

## Alternatives considered

- Rely only on idempotency keys: insufficient if the client retries with a different key or the first request partially succeeded before failing.
- Add a unique constraint on `term_sense`: rejected because senses are intentionally append-only and duplicates (including near-duplicates) are permitted by design (ADR 0002).

