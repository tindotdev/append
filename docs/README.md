# Documentation policy

Documentation in this repo is a contract.

## Must be up-to-date

- `AGENTS.md`
- Everything under `docs/` (design, build plan, ADRs, risks, etc.)
- `docs/runbook.md`

If the code changes behavior, update docs in the same change (or immediately after).

## Temporary files (allowed)

Temporary working docs are allowed for in-flight work:

- `HANDOFF.md` (hand-off notes for unfinished long tasks)
- `ISSUE.md` (current issue being investigated/fixed)
- `TASK.md` (current task focus)
- `DEBUG_{problem}.md` (debug log for an unresolved bug)

## Archiving

If a temporary doc becomes useful for future reference, move it to `docs/archive/` and ensure it is accurate.
