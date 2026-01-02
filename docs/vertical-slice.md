# Append — Vertical slice

The full, detailed vertical slice spec for steps 1–7 is archived at `docs/archive/vertical-slice.md` (historical snapshot).

## What the archived slice covered (steps 1–7)

- Google SSO allowlist auth
- Capture a batch of terms (now 1–200 terms)
- Edit candidates with optimistic locking
- Generate AI suggestions (parallelized)
- Accept-all materializes Terms + Senses (retry-safe/idempotent)
- Bucket feed + review surface for flagged items
- Export + Import (ENG-LOG markdown)

## Current stage

- Vertical slice steps 1–7 are complete and archived.
- **Active**: UI Linear-style enhancements (branch: `feat/ui-linear-enhancements`)

## UI Enhancements Vertical Slice

### Phase 1: Quick wins + Capture redesign ✓

- [x] Capture page term composer (ADR 0016)
- [x] Sidebar scrollbar fix
- [x] Favicon setup

### Phase 2: Search improvements ✓

- [x] Move global search to sidebar
- [x] Add search box to bucket pages

### Phase 3: Core UX (bucket table + right panel) ✓

- [x] Bucket table with TanStack Table
- [x] Right-side panel for term details
- [x] Edit term sense (PATCH endpoint)
- [x] Edit terms (PATCH endpoint)
- [x] Optimistic with undo (Sonner)

### Phase 4: History tracking ✓

- [x] Import history (ImportRun + ImportFile tables, GET /api/import/history, UI)
- [x] Export history (ExportLog table, GET /api/export/history, UI)

### Deferred (Backlog)

- Dashboard summary (Review & Resume) — align to UX north-star first

## Related

- ADR 0015: Linear-style sidebar layout
- ADR 0016: Capture page term composer
- UI Improvements roadmap: `docs/ui-improvements.md`
- Build plan: `docs/build-plan.md`
