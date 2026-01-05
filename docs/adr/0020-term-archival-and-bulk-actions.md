# ADR 0020 — Term archival + bulk actions (delete/move)

Status: Accepted  
Date: 2026-01-05

## Context

Users need to:

- remove bad/obsolete vocabulary entries safely (“Delete”)
- reorganize entries (“Move to bucket…”)
- do the above in bulk from the bucket feed table

Constraints we must preserve (see `docs/design.md` and ADRs):

- No hard deletes by default; keep an audit trail via soft delete (`archived_at`).
- Bucket feed renders a Term via its **primary sense** (ADR 0003).
- No silent overwrites: concurrent edits must detect conflicts via optimistic locking (ADR 0017).
- Buckets are user-owned and dynamic (ADR 0012).
- Outbox v1 is capture-only; do not expand it for delete/move in this iteration (ADR 0018).

## Decision

### 1) “Delete” means archive (soft delete)

Use the existing `archived_at` columns on `term` and `term_sense`.

- No hard delete / purge.
- No separate tombstone table.
- No edit-history log in v1 (deferred; see ADR 0017).

### 2) Add explicit archive/restore endpoints (command-style)

New endpoints:

- `POST /api/term/:id/archive` `{ expectedVersion }`
- `POST /api/term/:id/restore` `{ expectedVersion }`
- `POST /api/term-sense/:id/archive` `{ expectedVersion }`
- `POST /api/term-sense/:id/restore` `{ expectedVersion }`

All are owner-only.

Idempotent transitions:

- If the row is already in the target state, return 200 with `{ noop: true }` and current versions.

Ownership checks for restore:

- Restore must work even when `archived_at` is set, so restore use cases must not rely on helpers that filter `archived_at IS NULL`.

### 3) Term archive/restore semantics

`POST /api/term/:id/archive`:

- Optimistic lock on the term row (`term.version === expectedVersion`).
- Archive the term (`archived_at = now`, `version++`).
- In the same D1 batch, archive all active senses for that term (`term_sense.archived_at IS NULL`, `archived_at = now`, `version++`).

`POST /api/term/:id/restore`:

- Optimistic lock on the term row (`term.version === expectedVersion`).
- Unarchive the term (`archived_at = NULL`, `version++`).
- In the same D1 batch, unarchive all senses for that term (`archived_at = NULL`, `version++`).

Rationale:

- Term-level archive/restore is the “big hammer” and is allowed to win over concurrent per-sense edits; conflict detection is on the term row.
- Restoring all senses guarantees `primary_sense_id` points to a non-archived sense.

### 4) TermSense archive/restore semantics (including primary replacement)

`POST /api/term-sense/:id/archive`:

- Optimistic lock on the sense row (`term_sense.version === expectedVersion`).
- Archive the sense (`archived_at = now`, `version++`).
- If the archived sense was the term’s primary sense:
  - pick a replacement primary sense (deterministic rules below)
  - update `term.primary_sense_id = replacementId`, `term.version++`
  - the term update must be conditional on `term.primary_sense_id === archivedSenseId` to avoid clobbering a concurrent primary change
  - if no replacement exists: archive the term as well (`archived_at = now`, `term.version++`)

Primary replacement rules (server-side, deterministic):

1. Prefer newest non-archived sense in the **same bucket** as the archived primary.
2. Else pick newest non-archived sense across any bucket.
3. Else (no remaining senses) archive the term.

`POST /api/term-sense/:id/restore`:

- Optimistic lock on the sense row.
- Unarchive the sense (`archived_at = NULL`, `version++`).
- If the parent term is archived, restore the term too (same request, same D1 batch).

### 5) “Move” updates the primary sense

Bucket feed “Move to…” acts on the **primary `TermSense`** and reuses the existing endpoint:

- `PATCH /api/term-sense/:id` `{ expectedVersion, bucket }`

Correctness requirement with custom buckets:

- When bucket is updated, persist both:
  - `term_sense.bucket` (slug)
  - `term_sense.bucket_id` (resolved from the user bucket table)

### 6) Bucket feed must return versions (for optimistic locking + Undo)

Update `GET /api/bucket/:slug` to include:

- `termVersion` (`term.version`)
- `primarySense.version` (`term_sense.version`)

### 7) UI / UX boundaries

- Bulk actions are a UI concern (TanStack Table selection + a fixed bulk bar); no global state library is required.
- Undo is implemented via Sonner toasts and the new restore/inverse endpoints.
- Outbox is not used for delete/move in v1.

## Consequences

### Positive

- Safe delete with audit retention (soft delete).
- Correctness under concurrency via optimistic locking + 409 conflicts.
- No “invisible term” bugs from archiving a primary sense: pointer is updated deterministically.
- Reversible actions via Undo without expanding Outbox scope.

### Negative / risks

- More API surface (4 new endpoints).
- Primary replacement logic adds edge cases; must be tested.
- Long-term restore UX (a “Trash” view) is not provided in v1; restore exists primarily for immediate Undo and operational recovery.

## Alternatives considered

- Hard delete: rejected (violates soft-delete/audit posture).
- Model delete as “new sense + archive old”: better auditability, but higher UX complexity (deferred; see ADR 0017).
- Expand Outbox to include delete/move: rejected for v1 (ADR 0018 scope).

## Approved implementation checklist

### API (Workers + D1)

- [ ] Add `POST /api/term/:id/archive` (term optimistic lock; archive term + all active senses; idempotent noop)
- [ ] Add `POST /api/term/:id/restore` (term optimistic lock; restore term + all senses; idempotent noop; ownership works for archived terms)
- [ ] Add `POST /api/term-sense/:id/archive` (sense optimistic lock; archive sense; if primary then replace primary or archive term; idempotent noop)
- [ ] Add `POST /api/term-sense/:id/restore` (sense optimistic lock; restore sense; optionally restore term; idempotent noop; ownership works for archived terms)
- [ ] Extend `GET /api/bucket/:slug` response to include `termVersion` + `primarySense.version`
- [ ] Update `PATCH /api/term-sense/:id` to persist `bucket_id` when bucket changes (slug + id stay consistent)
- [ ] Add API tests covering:
  - [ ] archive/restore term hides/shows in bucket feed + export
  - [ ] archive/restore non-primary sense
  - [ ] archive primary sense w/ replacement
  - [ ] archive primary sense w/o replacement archives term
  - [ ] version conflicts (409) for all endpoints

### Web (SPA)

- [ ] Add row selection state to bucket feed table (TanStack `rowSelection`)
- [ ] Add selection + row actions columns (Move, Delete)
- [ ] Add fixed bulk action bar (visible only when `selectedCount > 0`)
- [ ] Add client helpers + React Query mutations for:
  - [ ] term archive/restore
  - [ ] term-sense archive/restore
- [ ] Wire Undo toasts to call restore/inverse endpoints using returned versions
- [ ] Add term detail actions:
  - [ ] delete sense (archive sense)
  - [ ] delete term (archive term)
- [ ] Add E2E: bucket feed delete + undo happy path

### Verification

- [ ] `pnpm -r --if-present typecheck`
- [ ] `pnpm test:api`
- [ ] `pnpm --filter @append/web test`
- [ ] `pnpm --filter @append/web test:e2e`
- [ ] `pnpm docs:policy`

