---
temporary: true
created: 2026-01-03
updated: 2026-01-05
---

> TEMPORARY FILE

# Term + TermSense archival (“soft delete”) + bulk actions

This proposal adds **safe deletion and bulk actions** to the bucket feed and term detail panel, aligned with:

- Design snapshot: `docs/design.md`
- ADR 0002: duplicates become senses — `docs/adr/0002-term-sense-duplicates.md`
- ADR 0003: bucket feed shows primary sense — `docs/adr/0003-bucket-feed-primary-sense.md`
- ADR 0012: custom user buckets — `docs/adr/0012-custom-user-buckets.md`
- ADR 0017: edits use optimistic locking — `docs/adr/0017-term-and-term-sense-editing.md`
- ADR 0018: Outbox is capture-only in v1 — `docs/adr/0018-outbox-backed-capture-semantics.md`

## Review vs current architecture (what changes from the original draft)

- Buckets are **user-owned and dynamic** (ADR 0012), not five fixed pages.
- The bucket list UI is `BucketFeedPage` + `BucketTable` (TanStack Table), not the shadcn “DataTable” example.
- Outbox v1 only supports `capture_terms`; delete/move should **not** depend on Outbox v1.
- “Delete” must preserve the **primary sense invariant**: we can’t leave `term.primary_sense_id` pointing at an archived sense, or the term disappears from feeds/exports.

## TL;DR (approved decision set)

- “Delete” means **archive** (soft delete), using existing `archived_at` columns on `term` and `term_sense`.
- Bucket feed row actions operate on:
  - **Term** (archive/restore) for “Delete”
  - **Primary TermSense** (bucket move) for “Move”
- Term detail panel adds:
  - archive/restore **a specific TermSense**
  - archive/restore the **whole Term**
- All state transitions use **optimistic locking** on the primary row being changed (ADR 0017).
- No hard delete; no edit-history log (deferred).
- No Outbox integration for delete/move in this iteration (Outbox expansion can be ADR’d later).

## Goals

- Safe deletion with audit retention (soft delete).
- Bulk actions on bucket feed: archive terms, move terms to a different bucket.
- Correctness under concurrency:
  - version conflicts return 409 (no silent overwrites)
  - primary-sense pointer stays valid
- UX: fast, reversible via Sonner “Undo”.

## Non-goals

- Hard delete / purge.
- Full append-only audit log for edits/deletes/restores.
- Offline-first delete/move via Outbox (future).

## Data model (no migration)

Already present in DB schema:

- `term.archived_at` + `term.version`
- `term_sense.archived_at` + `term_sense.version`

## API proposal

### A) Extend bucket feed response to include versions (required for optimistic locking from the table)

Update `GET /api/bucket/:slug` to include:

- `term.version` (as `termVersion`)
- `term_sense.version` for the primary sense (as `primarySense.version`)

Without this, the bucket table can’t safely call archive/move endpoints.

### B) Term archive/restore (row action “Delete”)

New endpoints:

- `POST /api/term/:id/archive` with JSON `{ expectedVersion: number }`
- `POST /api/term/:id/restore` with JSON `{ expectedVersion: number }`

Behavior:

- `archive`:
  - conditionally update the term where `term.version === expectedVersion`:
    - set `archived_at = now`
    - increment `version`
  - in the same D1 batch, archive all **active** senses for the term (`term_sense.archived_at IS NULL`):
    - set `archived_at = now`
    - increment `version`
- `restore`:
  - conditionally update the term where `term.version === expectedVersion`:
    - set `archived_at = NULL`
    - increment `version`
  - restore all senses for the term (set `archived_at = NULL`, increment `version`)

Notes:

- Term archive/restore is the “big hammer”: it intentionally wins over concurrent per-sense edits; conflict detection is at the term row.
- Restoring all senses ensures `primary_sense_id` points to a non-archived sense again.
- Idempotent transitions (retry-safe UX):
  - If the term is already archived/restored, return 200 with `{ noop: true }` and the current versions instead of failing.
- Ownership checks for restore must work on archived rows:
  - `restore` must not rely on `requireTermOwned(...)` (which filters `archived_at IS NULL`); it should verify ownership without excluding archived terms.

### C) TermSense archive/restore (term detail “Delete sense”)

New endpoints:

- `POST /api/term-sense/:id/archive` with JSON `{ expectedVersion: number }`
- `POST /api/term-sense/:id/restore` with JSON `{ expectedVersion: number }`

Behavior:

- `archive`:
  - conditionally update sense where `term_sense.version === expectedVersion` and `archived_at IS NULL`:
    - set `archived_at = now`
    - increment `version`
  - if the archived sense was the term’s primary sense:
    - atomically pick a replacement primary sense (see rules below)
    - update `term.primary_sense_id = replacementId`, increment `term.version`
      - condition should include `term.primary_sense_id === archivedSenseId` to avoid clobbering a concurrent primary change
    - if no replacement exists, archive the term as well (term has no remaining senses)
- `restore`:
  - conditionally update sense where `term_sense.version === expectedVersion` and `archived_at IS NOT NULL`:
    - set `archived_at = NULL`
    - increment `version`
  - if the parent term is archived, restore the term too (same request, same D1 batch)

Notes:

- Idempotent transitions (retry-safe UX):
  - If the sense is already archived/restored, return 200 with `{ noop: true }` and the current versions instead of failing.
- Ownership checks for restore must work when the parent term is archived:
  - `restore` must verify ownership without excluding archived terms (same caveat as above).

Primary replacement rules (server-side, deterministic):

1. Prefer newest non-archived sense in the **same bucket** as the archived primary.
2. Else pick newest non-archived sense across any bucket.
3. Else (no remaining senses) archive the term.

### D) Move (bulk + per-row)

For “Move to bucket…”, reuse the existing endpoint:

- `PATCH /api/term-sense/:id` with JSON `{ expectedVersion: number, bucket: string }`

Required follow-up for correctness with custom buckets:

- When bucket is updated, also keep `term_sense.bucket_id` in sync (server already looks up the bucket by slug; it should persist the ID too).

## Web UI proposal

### Bucket feed table (`packages/web/src/features/bucket/pages/BucketFeedPage.tsx`)

Add:

- Row selection (TanStack `rowSelection` state) + selection column:
  - header checkbox selects all currently loaded rows in the table
  - row checkbox selects the row
- Row actions column:
  - “Move to…” (opens a bucket picker)
  - “Delete” (archives the term)
- Fixed bulk action bar:
  - visible only when `selectedCount > 0`
  - shows count + “clear”
  - actions dropdown: Move, Delete

Undo UX:

- After a successful archive/move, show a Sonner toast with `Undo`.
- Undo calls the matching restore/inverse API using the **post-mutation versions** returned by the server (or `{ noop: true }` current versions).

State management:

- No `zustand` required; keep selection state local to the bucket feed route.

### Term detail sheet (`packages/web/src/features/bucket/components/TermDetailSheet.tsx`)

Add:

- “Delete sense” action per sense row (archives that `term_sense`)
- “Delete term” action in the header (archives the `term`)

Both use the same “update with undo” pattern already in the file (Sonner + optimistic locking + conflict toast).

## Error handling / conflict UX

- 409 `VERSION_CONFLICT` → toast: “Conflict. Please refresh.”
- 404 `NOT_FOUND` → toast: “Already deleted or not found.”
- For bulk actions: aggregate results and present:
  - `Archived X terms` (with Undo)
  - `Y failed` (button to “Show details” later; optional in v1)

## Testing strategy

API tests (Vitest, similar style to existing):

- Archive term:
  - archives term + all senses
  - filtered out of `GET /api/bucket/:slug` and export
  - restore reverses it
- Archive term sense:
  - non-primary: only that sense disappears from term detail
  - primary with replacement: updates `primary_sense_id` deterministically
  - primary with no replacement: archives the term
- Version conflicts for all four new endpoints

Web tests:

- Unit test: bulk bar render logic (hidden when `selectedCount === 0`)
- E2E (Playwright): bucket feed → delete → undo → row reappears

## Implementation checklist (ship-ready)

### API (Workers + D1)

- [x] Add `POST /api/term/:id/archive` (expectedVersion, soft delete, version++) — `packages/api/src/features/term/usecases/archiveTerm.ts`, `routes.ts:85`
- [x] Add `POST /api/term/:id/restore` (expectedVersion, unarchive, version++) — `packages/api/src/features/term/usecases/restoreTerm.ts`, `routes.ts:119`
- [x] Add `POST /api/term-sense/:id/archive` (expectedVersion, soft delete, version++, primary replacement) — `packages/api/src/features/term-sense/usecases/archiveTermSense.ts`, `routes.ts:77`
- [x] Add `POST /api/term-sense/:id/restore` (expectedVersion, unarchive, version++, possibly restore term) — `packages/api/src/features/term-sense/usecases/restoreTermSense.ts`, `routes.ts:117`
- [x] Extend `GET /api/bucket/:slug` response to include `termVersion` + `primarySense.version` — `packages/api/src/features/bucket/usecases/getBucketFeed.ts:16-28`
- [x] Update `PATCH /api/term-sense/:id` to persist `bucket_id` when bucket changes (keep slug + id consistent) — `packages/api/src/features/term-sense/usecases/updateTermSense.ts:62-83`
- [x] Add/extend API tests for all above — `packages/api/test/term-archive.spec.ts` (11 tests), `packages/api/test/term-sense-archive.spec.ts` (14 tests)

### API response shapes (for Undo + versioning)

- [x] Archive/restore endpoints return updated row versions needed for Undo:
  - [x] `POST /api/term/:id/archive|restore` → `{ term: { id, version, archivedAt }, noop?: boolean }` — done
  - [x] `POST /api/term-sense/:id/archive|restore` → `{ sense: { id, termId, version, archivedAt }, term?: { id, primarySenseId, version, archivedAt }, noop?: boolean }` — done

### Web (SPA)

- [x] Update web types to include `termVersion` and `primarySense.version` — `packages/web/src/features/bucket/types/index.ts`
- [x] Add TanStack Table row selection to `BucketTable` — `packages/web/src/features/bucket/components/BucketTable.tsx:17-19,36-44`
- [x] Add selection + actions columns to `packages/web/src/features/bucket/components/columns.tsx` — `packages/web/src/features/bucket/components/columns.tsx:44-124`
- [x] Add bulk action bar component (local to bucket feature; fixed bottom) — `packages/web/src/features/bucket/components/BulkActionBar.tsx`
- [x] Add term archive + restore client API helpers + mutations — `packages/web/src/features/bucket/api/archive-term.ts`
- [x] Add term-sense archive + restore client API helpers + mutations — `packages/web/src/features/bucket/api/archive-term-sense.ts`
- [x] Wire per-row Delete + Move, and bulk Delete + Move — `packages/web/src/features/bucket/pages/BucketFeedPage.tsx:217-375`
- [x] Add Sonner Undo for move/delete (single toast per bulk operation) — `packages/web/src/features/bucket/pages/BucketFeedPage.tsx:225-240,285-306,349-373`
- [ ] Add sense delete + term delete actions in `TermDetailSheet`
- [ ] Add E2E test: delete + undo happy path

### Product / UX sanity checks

- [ ] Deleting a primary sense never leaves the term “invisible” if other senses exist.
- [ ] Bulk actions do not act across pagination (only current loaded rows).
- [ ] Conflicts (409) produce a clear “refresh” message and do not silently drop selection.

### Verification

- [ ] `pnpm -r --if-present typecheck`
- [ ] `pnpm test:api`
- [ ] `pnpm --filter @append/web test`
- [ ] `pnpm --filter @append/web test:e2e` (requires Playwright env + auth bootstrap)
- [ ] `pnpm docs:policy`

## UI mock (optional)

```
Viewport Bottom (Fixed Position)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


                ┌─────────────────────────────────┐
                │  ╔═══════════════════════════╗  │  ← Drop shadow
                │  ║                           ║  │     (elevation)
                │  ║  ┌──────────┐  ┌────────┐ ║  │
                │  ║  │          │  │        │ ║  │
                │  ║  │ 4 selected  │  ×  │ ║  │ ← Selection count
                │  ║  │          │  │        │ ║  │   & clear button
                │  ║  └──────────┘  └────────┘ ║  │
                │  ║         │            │    ║  │
                │  ║         │         ┌──────────────┐
                │  ║         │         │ Divider line │
                │  ║         │         └──────────────┘
                │  ║         │            │          ║  │
                │  ║  ┌──────────────────────┐      ║  │
                │  ║  │  ⋮⋮  Actions   ▼  │      ║  │ ← Actions
                │  ║  │                    │      ║  │   dropdown
                │  ║  └──────────────────────┘      ║  │   button
                │  ║                           ║  │
                │  ╚═══════════════════════════╝  │
                └─────────────────────────────────┘
                         ↑
                    Rounded corners
                    Dark background
                    (~#2C2C2C)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────────────────────────────────────────────────────────┐
│                    BULK ACTION BAR                           │
│                                                              │
│  Position: fixed; bottom: 20-30px; left: 50%; transform: translateX(-50%)
│                                                              │
│  ┌────────────────────┬───┬──────────────────────────────┐  │
│  │                    │   │                              │  │
│  │   SELECTION INFO   │ │ │      ACTION TRIGGER        │  │
│  │                    │   │                              │  │
│  ├────────────────────┼───┼──────────────────────────────┤  │
│  │                    │   │                              │  │
│  │  ┌──────────────┐  │   │  ┌────────────────────────┐ │  │
│  │  │ "4 selected" │  │ × │  │ [⋮⋮] Actions      [▼] │ │  │
│  │  └──────────────┘  │   │  └────────────────────────┘ │  │
│  │   Text: #A0A0A0    │   │   Icon + Label + Chevron   │  │
│  │   Font: 14px       │   │   Background: #3A3A3A      │  │
│  │                    │   │   Padding: 8px 16px        │  │
│  └────────────────────┴───┴──────────────────────────────┘  │
│                                                              │
│  Background: #2C2C2C                                         │
│  Border-radius: 8px                                          │
│  Box-shadow: 0 4px 12px rgba(0,0,0,0.4)                    │
│  Padding: 12px 16px                                          │
│  Gap: 16px (between elements)                                │
└──────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════╗
║                      STATE VARIANTS                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  DEFAULT STATE:                                              ║
║  ┌────────────────────────┐                                  ║
║  │ 4 selected  × │ ⋮⋮ Actions ▼ │                             ║
║  └────────────────────────┘                                  ║
║                                                              ║
║  HOVER STATE (Actions button):                               ║
║  ┌────────────────────────┐                                  ║
║  │ 4 selected  × │ ⋮⋮ Actions ▼ │  ← bg: #4A4A4A            ║
║  └────────────────────────┘                                  ║
║                                                              ║
║  ACTIONS MENU OPEN:                                          ║
║  ┌────────────────────────┐                                  ║
║  │ 4 selected  × │ ⋮⋮ Actions ▲ │                             ║
║  └────────────────────────┘                                  ║
║            │                                                 ║
║            └─────┬───────────────────┐                       ║
║                  │  Assign to...     │                       ║
║                  │  Change status... │                       ║
║                  │  Add labels...    │                       ║
║                  │  Set priority...  │                       ║
║                  │  ───────────────  │                       ║
║                  │  Delete           │                       ║
║                  └───────────────────┘                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

←─────────── Min: ~280px, Max: ~400px ───────────→

        ┌──────────────────────────────────────────────┐
     ↑  │  ↕12px                                       │
     │  │  ┌──────────────┐ ┌────────────────────┐    │
  ~56px │  │ 4 selected × │ │ ⋮⋮ Actions      ▼ │    │
     │  │  └──────────────┘ └────────────────────┘    │
     ↓  │  ↕12px     ←16px→                           │
        └──────────────────────────────────────────────┘
              ←16px→                    ←16px→
              padding                   padding
```
