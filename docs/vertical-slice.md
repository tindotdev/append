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

### Phase 1: Quick wins + Capture redesign

- [ ] Capture page term composer (ADR 0016)
- [ ] Sidebar scrollbar fix
- [ ] Favicon setup

### Phase 2: Search improvements

- [ ] Move global search to sidebar
- [ ] Add search box to bucket pages

### Phase 3: Core UX (bucket table + right panel)

- [ ] Bucket table with TanStack Table
- [ ] Right-side panel for term details
- [ ] Edit term sense (PATCH endpoint)
- [ ] Edit terms (PATCH endpoint)
- [ ] Optimistic with undo (Sonner)

### Phase 4: History tracking

- [ ] Import history (ImportRun table + UI)
- [ ] Export history (ExportLog table + UI)

### Deferred (Backlog)

- Dashboard summary (Review & Resume) — align to UX north-star first

## Related

- ADR 0015: Linear-style sidebar layout
- ADR 0016: Capture page term composer
- UI Improvements roadmap: `docs/ui-improvements.md`
- Build plan: `docs/build-plan.md`
