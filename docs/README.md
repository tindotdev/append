# Documentation policy

Documentation in this repo is a contract.

## Policy (strict)

- **Canonical (single source of truth):**
  - `docs/design.md`
  - `docs/adr/` (ADRs)

- **Allowed supporting docs (only if they directly support the canonical docs):**
  - `docs/runbook.md` — operational setup (needed to run/deploy)
  - Keep this list short and operational only.

Everything else should be deleted or moved into:
- an ADR (if it records a durable decision), or
- a PR description / issue tracker (if it’s planning, notes, or progress tracking).

## Must be up-to-date

- `AGENTS.md`
- Everything under `docs/`
- `docs/runbook.md`
- ENG-LOG legacy format reference: <https://github.com/tindotdev/eng-log> (import/export contract; see `docs/design.md`).

If the code changes behavior, update docs in the same change (or immediately after).
