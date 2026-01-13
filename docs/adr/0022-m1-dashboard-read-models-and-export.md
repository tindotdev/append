# ADR 0022 — M1 dashboard read models + raw events export

Date: 2026-01-10

## Status

Accepted.

## Context

We have completed M0: the Chrome extension emits `artifact_active` heartbeats, and the API ingests and stores append-only `event` rows in D1 with idempotent dedupe by `(user_id, device_id, event_id)` (see `docs/design.md` “Current stage”).

The current web dashboard is a UI prototype driven by a **local telemetry simulator** (client-side rollups). To reach the MVP milestone (M1), the dashboard must be backed by real server read models computed from ingested events, and users must be able to export their raw event history (“don’t die” requirement).

## Decision

Ship M1 by implementing:

1. **Dashboard read models** computed **on read** from the canonical `event` store (no materialized rollup tables required for MVP):
   - `GET /api/dashboard/today?tz=...`
   - `GET /api/dashboard/week?start=YYYY-MM-DD&tz=...`
   - `GET /api/dashboard/heatmap?year=YYYY&tz=...`

2. **Raw events export** as NDJSON:
   - `GET /events/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=ndjson`

3. **Captures end-to-end**:
   - The extension can emit `capture` events (`term|question`) tied to the current artifact.
   - The dashboard can display “Today captures” from real API data.

4. **Contract alignment**:
   - Ingest response shape is `{ validated, inserted, rejected, server_time_ms }` (not `accepted`), and documentation must match.

## Deliverables (clear acceptance criteria)

### API: dashboard

- [ ] `/api/dashboard/*` routes exist and require cookie session auth (same user identity as `/api/*`).
- [ ] `GET /api/dashboard/today` returns real totals + breakdowns derived from `event` for the authenticated user.
- [ ] `GET /api/dashboard/week` returns a real 7-day series + per-topic/per-source totals for the authenticated user.
- [ ] `GET /api/dashboard/heatmap` returns per-day minutes for a year + stats for the authenticated user.
- [ ] Rollup logic matches the MVP algorithm in `docs/design.md`:
  - `HEARTBEAT_INTERVAL_MS = 30_000`, `IDLE_CUTOFF_MS = 300_000`, `MAX_CREDIT_PER_HEARTBEAT_MS = interval_ms`
  - credit only when `active_signals` are active (`!user_idle && window_focused && tab_active`)
  - streak uses `learning_minutes >= 10` in the requested timezone
- [ ] Topics are assigned via MVP rules/heuristics, with `topic_override` events taking precedence.
  - Guardrail: endpoints may return 413 `RANGE_TOO_LARGE` with details `{ max_events_scanned: 250000 }`.

### API: export

- [ ] `GET /events/export` streams NDJSON (one event per line) for the authenticated user and date range.
- [ ] Export does not load the full range into memory; it paginates/chunks reads.

### Web

- [ ] Dashboard UI reads from `/api/dashboard/*` endpoints (no mock/local telemetry required for production path).
- [ ] Local telemetry simulator remains available as a dev tool (flagged or clearly separated from the prod path).

### Extension

- [ ] Popup supports creating `capture` events and flushing them via the existing outbox + retry semantics.

### Docs

- [ ] `docs/design.md` matches real ingest response semantics (`validated` vs `accepted`).
- [ ] Any new endpoints are documented at least at the “shape + intent” level in `docs/design.md`.

### Tests

- [ ] API tests cover `GET /api/dashboard/today|week|heatmap` for basic correctness.
- [ ] API tests cover `GET /events/export` response format and ownership rules.

## Notes

- Detailed step-by-step work breakdown is tracked in issues/PR descriptions (not in ADRs).

## Non-goals (explicitly deferred past M1)

- Materialized rollup tables (daily rollups) or background jobs.
- Async AI topic classification.
- Storing full URLs by default (privacy-first defaults remain).
