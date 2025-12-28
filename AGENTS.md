# Agent Guide: `append` (lean)

## Quick commands

- Workspace: `./pnpm-workspace.yaml`
- `pnpm -r --if-present typecheck`

## Source of truth

- Design snapshot: `docs/design.md`
- Build plan: `docs/build-plan.md`
- Vertical slices: `docs/vertical-slice.md`
- Testing strategy: `docs/testing.md`
- Risks: `docs/risk-register.md`
- ADRs: `docs/adr/README.md`
- Documentation policy: `docs/README.md`

## Documentation is a contract

- Keep `AGENTS.md` and everything under `docs/` accurate and update to date.

## Working mode

- Implement by milestones in `docs/build-plan.md`; keep `docs/vertical-slice.md` runnable.
- Material decision change → add a new ADR and mark the old one “Superseded”.

## Current stage

- Vertical slice step 7 is complete and archived.
- Focus: review all 7 slices, refresh UI, and refactor where needed.

## Engineering defaults (unless an ADR says otherwise)

- Cloudflare-first: SPA on Pages + API on Workers (Hono) + D1 for relational storage.
- Correctness: idempotent creates/accept/import; retry-safe jobs; conditional transitions; conflict detection for edits; soft deletes.
- UI: calm-by-default feed (primary sense only) + explicit review surface for flagged items.

## Anti-patterns to avoid

- SSR/adapters complexity for this private app.
- Silent overwrites (last-write-wins) on user edits.
- Premature queues/events/microservices.

## LLMS.txt

- `ai-sdk`: ./tmp/ai-sdk/llms.txt
- `valibot`: ./tmp/valibot/AGENTS.md
