# ADR 0027 — Data retention and account deletion (public release)

Status: Accepted
Date: 2026-02-04

## Context

Public release introduces sign-up and user-owned data. We need a clear, stable policy for:

- what we retain by default
- what happens when a user deletes their account
- how deletion is implemented safely in D1

This is primarily about user-owned portfolio data (terms/senses/captures) and AI suggestion outputs.

## Decision

### Retention (launch)

- **Terms + senses (user-owned portfolio data)**: retained indefinitely by default.
- **AI suggestions**: retained indefinitely by default (bounded by ADR 0026 quotas).

### Account deletion

Account deletion **hard-deletes** the user and all user-owned data in D1:

- Delete the `user` row.
- Rely on D1 foreign keys with `ON DELETE CASCADE` to remove user-owned rows (sessions, accounts, domain tables, events, device tokens, suggestion quota rows, etc).

After deletion, a user can sign in again and create a fresh account (subject to the current auth posture in ADR 0025, e.g. `AUTH_MODE=restricted` vs `AUTH_MODE=public`).

## Consequences

### Positive

- Simple mental model: user data persists unless the user deletes their account.
- Straightforward D1 implementation via FK cascades (minimal bespoke cleanup code).
- Easy to explain in privacy messaging.

### Negative

- “Indefinite retention” increases long-term storage footprint (mitigated by product caps/quotas).
- Hard delete means there is no built-in recovery.

## Implementation notes

- Ensure all user-owned tables reference `user(id)` with `ON DELETE CASCADE`.
- Account deletion endpoint should:
  - require recent auth / user confirmation (UI flow)
  - delete the `user` row in a single transaction
  - log a minimal structured event (no PII) for audit/ops

## References

- ADR 0025: Public auth and telemetry separation
- ADR 0026: Term suggestion quotas and global budget
