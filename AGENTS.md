# Agent Guide: `append` (lean)

## Quick commands

- Workspace: `./pnpm-workspace.yaml`
- `pnpm -r --if-present typecheck`
- `pnpm docs:policy`

## Source of truth

**Canonical (single source of truth)**

- Design snapshot: `docs/design.md`
- Decisions: `docs/adr/README.md` (+ individual ADRs)

**Allowed supporting docs (only if essential)**

- Runbook: `docs/runbook.md`
- Documentation policy: `docs/README.md`

## Documentation is a contract

- Keep `AGENTS.md` and everything under `docs/` accurate and update to date.

## AGENTS.md policy (token-lean)

- Keep only this repo-root `AGENTS.md` (no per-package `AGENTS.md`).
- Prefer `pnpm --filter @append/{api,web}` scripts over local instructions.

## Working mode

- Keep `docs/design.md` current as the snapshot; capture material decisions in ADRs.
- Track progress/plans in PR descriptions and the issue tracker (avoid persisting plan/proposal docs).
- Material decision change → add a new ADR and mark the old one “Superseded”.

## Current stage

- See `docs/design.md` (“Current stage”).

## Engineering defaults (unless an ADR says otherwise)

- Cloudflare-first: SPA on Pages + API on Workers (Hono) + D1 for relational storage.
- Correctness: idempotent creates/accept/import; retry-safe jobs; conditional transitions; conflict detection for edits; soft deletes.
- UI: calm-by-default feed (primary sense only) + explicit review surface for flagged items.
- Code quality: Biome for formatting/linting + ESLint boundaries for feature isolation (`pnpm lint:boundaries`).

## Anti-patterns to avoid

- SSR/adapters complexity for this private app.
- Silent overwrites (last-write-wins) on user edits.
- Premature queues/events/microservices.

## LLMS.txt

- `ai-sdk`: ./tmp/ai-sdk/llms.txt
- `valibot`: ./tmp/valibot/AGENTS.md
