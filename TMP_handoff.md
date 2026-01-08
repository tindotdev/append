---
temporary: true
created: 2026-01-08
branch: feat/event-ingest
---

> TEMPORARY FILE — handoff notes for the next implementation session.
> This consolidates the earlier prototype handoff + checklist into a single place.

# Append — telemetry pivot handoff (events-first, WakaTime-for-learning)

## Context (product pivot)

The project pivoted from Term/TermSense-first to **events-first learning telemetry** (ADR 0020):

- Canonical store is an append-only `Event` stream (events → sessions → rollups → dashboards).
- Primary UX surface is the dashboard (Today / Week / Heatmap).
- Chrome extension is the primary emitter.

Sources of truth:

- Snapshot: `docs/design.md`
- Decision: `docs/adr/0020-events-first-learning-telemetry.md`

## What’s implemented now

### Web (UX prototype)

Commit: `5e706c2` (web: local telemetry simulator)

- `/` redirects to `/dashboard`.
- Dashboard rollups are derived from a local event store (localStorage), driven via a “Telemetry (local simulator)” panel.
- NDJSON export works as a browser download (prototype-only).

Code:

- `packages/web/src/features/dashboard/telemetry/*`
- `packages/web/src/features/dashboard/pages/DashboardPage.tsx`

### API: real ingest path + D1 storage

Commit: `b2c6e50` (api: add /events/ingest with D1 event store)

- `POST /events/ingest` is live in the Worker (not under `/api/*`).
- Auth is enforced; server derives `user_id` from Better Auth session (cookie).
- D1 tables added:
  - `device` (tracks install + `last_seen_at`)
  - `event` (append-only event stream; dedupe key is `(user_id, device_id, event_id)`)
- Validation is in place for the MVP event types:
  - `artifact_active`, `capture`, `topic_override`, `aha_candidate`
- Tests added for ingest (auth, partial rejection, dedupe).

Code:

- Route: `packages/api/src/features/events/routes.ts`
- Validation: `packages/api/src/features/events/validation/events.schema.ts`
- Schema: `packages/api/src/db/events.schema.ts`
- Migration: `packages/api/drizzle/0006_slim_callisto.sql`
- Test: `packages/api/test/events.ingest.spec.ts`

Notes:

- Response shape currently returns `accepted = submitted - rejected` and does **not** distinguish “inserted vs duplicate-ignored”.
  - For an outbox client, this means a `200` can be treated as “acked” for all non-rejected events, because server-side dedupe is canonical.
- `client_batch_id` is accepted but currently unused (reserved for future batch-level sugar).

### Documentation updates

- `docs/design.md` now marks `/events/ingest` as complete (Definition of Done section).
- `AGENTS.md` is updated and committed to reflect the telemetry pivot + implementation scope.
  - Commit: `2181996` (docs: update AGENTS for events-first ingest)

## How to run / verify locally

From repo root:

- API typecheck/tests:
  - `pnpm --filter @append/api typecheck`
  - `pnpm --filter @append/api exec vitest run`
- Apply D1 migrations (local):
  - `pnpm --filter @append/api db:migrate:local`
- Start API worker:
  - `pnpm --filter @append/api dev`
- Start web:
  - `pnpm --filter @append/web dev`

## Open decisions / TODOs (next work)

### 1) Chrome extension (MV3 emitter)

Build the real emitter + outbox:

- Stable IDs: generate and persist `device_id` in `chrome.storage.local`; generate per-event `event_id` UUID.
- Heartbeats (`artifact_active`): alarm tick every 30s; only for `http/https`; include `window_focused`, `tab_active`, `user_idle`.
- Capture UX: minimal surface that creates `capture` events tied to current artifact.
- Outbox semantics: queue events locally, retry upload, delete only after “acked”.

Important: decide **auth strategy for extension**.

- Current `/events/ingest` auth expects Better Auth session cookie.
- Options:
  - Extension relies on the user having a valid session cookie (fetch with `credentials: 'include'`).
  - Add token-based auth for extension (requires design + implementation).

### 2) Export endpoint (durability / portability)

- Implement `GET /events/export?from&to&format=ndjson`.
- Decide streaming vs chunking (Cloudflare constraints).

### 3) Dashboard read models (MVP: compute-on-read)

- Implement:
  - `GET /dashboard/today`
  - `GET /dashboard/week`
  - `GET /dashboard/heatmap`
- You can port the rollup logic from the web prototype:
  - `packages/web/src/features/dashboard/telemetry/rollups.ts`
- Confirm timezone source of truth (user setting vs request param vs browser default).

### 4) Prereqs to lock (from design)

- URL normalization for `url_hash` (fragment stripped, query stripped, host lowercased, path kept).
- Heartbeat interval + idle cutoff defaults (`30s` / `5m`).
- Privacy defaults: store host + url_hash only; full URL opt-in later.

## Housekeeping (TMP consolidation)

Recommendation: keep **only** this file as the handoff doc.

- `TMP_handoff-2026-01-08.md` and `TMP_implementation-checklist.md` were earlier temporary, untracked notes; they can be deleted to reduce confusion.

