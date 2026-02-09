# ADR 0017 — Term + TermSense edits with optimistic locking

Status: Superseded by ADR 0020
Date: 2026-01-02
Superseded: 2026-01-08

## Context

The app’s “calm by default” feed and term detail panel benefit from small corrections:

- Fixing `displayTerm` casing/spelling without changing the canonical key (`canonical`).
- Fixing a `TermSense`’s text (typos/clarity) or correcting its bucket assignment.

We also need to preserve the project’s “no silent overwrites” rule: concurrent edits should not be last-write-wins.

## Decision

Allow in-place edits to:

- `Term.displayTerm`
- `TermSense.text` and `TermSense.bucket`

All edits must use optimistic locking:

- The client sends `expectedVersion`.
- The server only updates if the stored `version === expectedVersion`.
- On conflict, return a 409 with the current version (and/or current row) so the UI can resolve explicitly.

## Consequences

- Preserves “no silent overwrites” while enabling lightweight corrections.
- `TermSense` is still append-only at the semantic level by convention (new meaning/context should be a new sense), but the storage row is no longer strictly immutable.
- Audit/history for edits is not captured yet; if we need full auditability, add an append-only edit log or model edits as “new sense + archive old”.

## Alternatives considered

- Strict append-only corrections (new sense + archive old): better auditability, more UI/UX complexity, more data churn.
- Last-write-wins updates: simpler, but violates conflict detection and risks silent overwrites.
