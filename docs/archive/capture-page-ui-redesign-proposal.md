---
temporary: false
created: 2026-01-02
archived: 2026-01-02
status: archived
author: tin
related_adr: docs/adr/0016-web-ui-capture-term-composer.md
---

# Capture Page Redesign Proposal

> Archived design proposal. Canonical decision: `docs/adr/0016-web-ui-capture-term-composer.md` (Accepted 2026-01-02).

## Executive summary

Replace the current `/batch/new` “paste into a textarea” batch creation UI with a **Linear-inspired term list composer**:

- Still optimized for fast capture (paste many, minimal chrome).
- Better for editing/removing individual terms before submit.
- Keeps the existing backend flow: **create batch only on explicit submit** → navigate to `/batch/:id` for suggestions/review/accept.

This proposal is intentionally **capture-only** (term input). It does not move suggestion generation or acceptance into the capture page.

## Context / source of truth

- Domain + invariants: `docs/design.md`
- Current web shell + shortcuts: `docs/adr/0015-web-ui-linear-sidebar-layout.md`
- Current batch UI + components roadmap: `docs/ui-improvements.md`

## Problem statement (today)

The current `/batch/new` experience is a single textarea + submit:

- Editing a specific line is fiddly (especially after paste).
- No per-term validation feedback (length, forbidden delimiter, duplicates) until submit fails.
- Hard to scan what’s in the batch and make small tweaks quickly.

## Goals

- **Fast capture**: paste many terms, minimal friction.
- **Fast correction**: edit/remove individual terms without wrestling a textarea.
- **Clear validation**: show issues per-row (before submit).
- **Keyboard-first**: efficient without mouse; matches the app’s “dense UI” direction.
- **Mobile-safe**: no hover-only affordances; works as a scrollable list with touch controls.

## Non-goals (for this redesign)

- Running AI suggestions on the capture page.
- Editing candidate bucket/definition before the batch exists server-side.
- Adding new backend endpoints (keep POST `/api/batch` as-is).

## Proposed UX (high-level flow)

1. User enters terms into a **list composer** (rows).
2. User fixes any invalid rows (inline feedback).
3. User clicks **Submit Batch** (or `Cmd+Enter`) → app calls `POST /api/batch`.
4. On success, navigate to `/batch/:id` (existing review + suggestions flow).

## Layout proposal

### Primary pattern: list composer (dense rows)

- One row per term.
- Row controls are visible on focus and on mobile (avoid hover-only).
- Optional per-row expand/collapse is reserved for future (e.g. “Explain it myself”), but not required for capture-only.

### Mock ASCII (capture-only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Capture                                                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ●  [Term input………………………………………]                     [×]     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ●  [Term input………………………………………]                     [×]     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ●  [Term input………………………………………]                     [×]     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  + Add term                                                                  │
│                                                                             │
│  [Submit batch]                                               12 / 200      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Legend (capture page):

```
● = Row status indicator (not color-only; always paired with tooltip/text)

[×] = Remove row

+ Add term = Adds an empty row and focuses it

```

## Interaction spec (concrete)

### Adding terms

- **Type + Enter**: commits the row and creates a new row below.
- **Paste many**:
  - Pasting multi-line text into any row splits on `\r?\n` and inserts one row per non-empty line (preserve order).
  - This keeps “brain dump” speed without forcing a textarea UI.
- **Add term button**: always available (mouse/touch-friendly).

### Editing

- Term input is **single-line**.
- Trimming: leading/trailing whitespace trimmed on commit; internal whitespace preserved for display (normalization remains backend-defined).
- Per-row actions (v1): remove row only.

### Validation rules (must match backend)

- Batch size: **1–200** non-empty lines after trim.
- Term length: **≤ 200 chars**.
- Term must not contain `: ` (colon-space) (export delimiter safety).
- Show validation **inline per row** and at the footer summary; disable Submit until valid.
- Duplicates are allowed, but should be visibly flagged as “duplicate (allowed)” to reduce accidental repeats.

### Submit + error handling

- Submit calls `POST /api/batch` with a per-attempt `clientRequestId` (idempotent replay safe).
- If submit fails with `IDEMPOTENCY_CONFLICT`, show a clear message and generate a new `clientRequestId` on next edit (current behavior).
- If submit succeeds, navigate to `/batch/:id` (existing flow).

### Unsaved work

- If the user has started typing and tries to navigate away, show a “Discard draft?” confirm.
- Persist the draft list in `localStorage` and restore on revisit/refresh (local-only; no server draft).
  - Clear the stored draft on successful submit, and provide an explicit “Clear draft” action.
  - Storage key should be versioned (e.g. `append.captureDraft.v1`) and ideally scoped per user.

## Keyboard shortcuts (capture page only)

- `Enter`: commit row + add next row (when focus is in a term input).
- `Shift+Enter`: insert literal newline is **not supported** (term is single-line).
- `Cmd+Enter` / `Ctrl+Enter`: submit batch (when valid).
- Keep global `Cmd+K` as the command palette (do not repurpose).

## Status indicator semantics (row)

Status should reflect **capture validity**, not AI/suggestion state:

- `Valid` (ready)
- `Invalid` (shows reason: too long, contains `: `, empty after trim)
- `Duplicate (allowed)`

AI suggestion status belongs on `/batch/:id` (already implemented).

## Responsive / mobile notes

- No hover-only controls. Actions must be reachable via a visible button.
- Consider a sticky bottom bar for primary actions (“Add term”, “Submit”).

## Implementation notes (product engineering)

- Keep API contract unchanged (POST `/api/batch`).
- Keep capture page scope tight; do not introduce a “draft batch” server-side concept.
- Reuse shadcn/ui primitives already in the repo (`Card`, `Input`, `Button`, `Tooltip`, `Kbd`).

## Definition of done (for development)

- User can paste 1–200 terms and see them as rows.
- User can edit/remove terms and see row-level validation before submit.
- Submit is keyboard-accessible and idempotency-safe.
- Works on mobile without hover affordances.

## Decisions (locked for v1)

1. **Draft persistence**: yes — local-only via `localStorage` (draft survives refresh).
2. **Row reorder**: defer (no drag-and-drop, no move actions).
3. **Row actions**: remove row only (no duplicate).
