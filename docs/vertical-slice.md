# Append — Vertical slice (archived)

The full, detailed vertical slice spec is archived at `docs/archive/vertical-slice.md` (historical snapshot).

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
- Focus now: Milestone 5 (“Explain it myself” feedback loop) + ongoing refactors (see `docs/build-plan.md`).
