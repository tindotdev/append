# Agent Guide: `append` (lean)

## Source of truth

- Design snapshot: `docs/design.md`
- Build plan: `docs/build-plan.md`
- First runnable slice: `docs/vertical-slice.md`
- Risks: `docs/risk-register.md`
- ADR index: `docs/adr/README.md`
- Documentation policy: `docs/README.md`

## Documentation is a contract (keep it current)

- `AGENTS.md` and everything under `docs/` must stay up-to-date with the actual system.
- Temporary working docs are allowed only for in-flight work:
  - `HANDOFF.md`, `ISSUE.md`, `TASK.md`, `DEBUG_{problem}.md`, `SUMMARY_{task}.md`, `PLAN_{task}.md`
- If a temporary doc becomes useful long-term, move it to `docs/archive/` (and keep it accurate).

## Locked decisions (current)

- ADR 0001: Google SSO allowlist (sub-first, email fallback)
- ADR 0002: Duplicate handling via `Term` + append-only `TermSense` (allowed-but-flagged)
- ADR 0003: Bucket feed shows primary sense by default (expand; “Needs review” view)
- ADR 0004: SPA (React + TanStack Router) + Hono on Workers (no SSR)
- ADR 0005: Web auth gating via protected layout route

## Working mode

- Implement by milestones starting at `docs/build-plan.md` and keep `docs/vertical-slice.md` runnable ASAP.
- Any material decision change → add a new ADR in `docs/adr/` and mark the old one “Superseded” (avoid rewriting history).

## Engineering defaults (unless an ADR says otherwise)

- Cloudflare-first: SPA on Pages + API on Workers (Hono) + D1 for relational storage.
- Correctness: idempotent creates/accept/import; retry-safe jobs; conditional transitions; conflict detection for edits; soft deletes.
- UI: calm-by-default feed (primary sense only) + explicit review surface for flagged items.

## Anti-patterns to avoid

- SSR/adapters complexity for this private app.
- Silent overwrites (last-write-wins) on user edits.
- Premature queues/events/microservices.
