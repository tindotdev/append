# ADR 0016 — Web UI: Capture page term composer (local draft)

Status: Accepted  
Date: 2026-01-02

## Context

The current capture route (`/batch/new`) uses a single textarea and submit button to create a batch. This is fast for initial paste, but it makes it hard to:

- edit/remove a single term after paste
- see per-term validation feedback before submit
- use the flow comfortably on mobile (cursor placement + line editing)

Constraints to preserve:

- Keep the existing backend contract: batch creation is via `POST /api/batch` and should remain idempotent via `clientRequestId`.
- Keep the product philosophy: **fast capture now, review/recall later** (AI suggestions and acceptance belong on `/batch/:id`).
- Keep ENG-LOG delimiter safety: terms must not contain `: ` (colon-space).

## Decision

Replace the `/batch/new` textarea UI with a **term list composer**:

1. **One row per term** with a single-line input.
2. **Multi-line paste** into a row splits on `\r?\n` and inserts one row per non-empty line (preserve order).
3. **Row actions (v1)**: remove row only (no row menu, no duplicate, no reorder).
4. **Row-level validation (pre-submit)** matching backend rules:
   - 1–200 non-empty terms after trim
   - max 200 chars per term
   - must not contain `: `
   - duplicates are allowed but should be visibly flagged as “duplicate (allowed)”
5. **Explicit submit creates the batch** (no server-side “draft batch”):
   - on submit: call `POST /api/batch` with a per-attempt `clientRequestId`
   - on success: navigate to `/batch/:id` (existing review + suggestions + accept flow)
6. **Local-only draft persistence (v1)**:
   - persist the draft rows in `localStorage` and restore on refresh
   - clear stored draft on successful submit
   - provide an explicit “Clear draft” action
   - use a versioned storage key and ideally scope per user (to avoid mixing drafts across accounts)
7. **Keyboard behavior (capture page only)**:
   - `Enter`: commit row + add a new row below (when focused in a term input)
   - `Cmd+Enter` / `Ctrl+Enter`: submit batch (when valid)
   - keep global `Cmd+K` as the command palette (do not repurpose)

## Consequences

**Positive:**

- Keeps capture fast while making post-paste cleanup much easier.
- Prevents submit-time surprise errors by surfacing validation inline.
- Avoids backend complexity (no draft-batch state machine).

**Tradeoffs / risks:**

- More frontend state and edge cases (paste splitting, focus management, large lists).
- `localStorage` draft is device-local and may contain sensitive terms; the UI must make clearing obvious.
- Need to ensure accessibility (no hover-only controls; clear error messaging; keyboard navigation).

## Alternatives considered

1. **Keep textarea** — rejected: too hard to edit individual lines; validation feedback comes too late.
2. **Add reorder / duplicate actions in v1** — deferred: increases UI surface area and accessibility complexity; not required for the core capture improvement.
3. **Create a server-side “draft batch”** — rejected: adds statefulness, new endpoints, and failure modes that conflict with the “explicit submit” + idempotent-create model.
4. **Global capture via command palette / `Cmd+K`** — rejected: conflicts with the existing command palette behavior and harms shortcut learnability.

## Related

- Design snapshot: `docs/design.md`
- Web shell + global shortcuts: `docs/adr/0015-web-ui-linear-sidebar-layout.md`
- Detailed design proposal (archived): `docs/archive/capture-page-ui-redesign-proposal.md`
