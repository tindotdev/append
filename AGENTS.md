# Agent Guide

## **THIS BRANCH: `feat/event-ingest`**

**Product direction:** events-first learning telemetry (WakaTime-for-learning) → dashboard-first UX (ADR 0020).

Primary focus for this branch is shipping the **real ingest path** and the client emitters (extension) that feed it.

---

## Quick commands

- `pnpm -r --if-present typecheck`
- Run web app: `pnpm --filter @append/web dev`

## Source of truth

**Canonical (single source of truth)**

- Design snapshot: `docs/design.md`
- Decisions: `docs/adr/README.md` (+ individual ADRs)
- Product direction pivot: `docs/adr/0020-events-first-learning-telemetry.md`

**Allowed supporting docs (only if essential)**

- Runbook: `docs/runbook.md`
- Documentation policy: `docs/README.md`

## Documentation is a contract

- Keep `AGENTS.md` and everything under `docs/` accurate and update to date.

## Working mode

- Keep `docs/design.md` current as the snapshot; capture material decisions in ADRs.
- Track progress/plans in PR descriptions and the issue tracker (avoid persisting plan/proposal docs).
- Material decision change → add a new ADR and mark the old one “Superseded”.

## Scope notes (implementation)

- Prefer **append-only, idempotent** event ingestion (dedupe by `(user_id, device_id, event_id)`).
- Keep client emitters retry-safe (outbox + acked deletes; never drop silently).
- Keep the web telemetry simulator available as a dev tool, but treat API + extension as source of truth.

## Current stage

- See `docs/design.md` ("Current stage").

## Engineering defaults (unless an ADR says otherwise)

- Cloudflare-first: SPA on Pages + API on Workers (Hono) + D1 for relational storage.
- Correctness: idempotent creates/accept/import; retry-safe jobs; conditional transitions; conflict detection for edits; soft deletes.

## Color Token Conventions

**Only use semantic color tokens. Never hardcode colors in the web module.**

All color tokens are defined in `packages/web/src/main.css` using OKLCH color space.
