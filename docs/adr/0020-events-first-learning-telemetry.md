# ADR 0020 — Events-first learning telemetry (WakaTime-for-learning)

Status: Accepted
Date: 2026-01-08

## Context

The project’s earlier direction centered on “capture terms → generate suggestions → accept into an append-only log (Term/TermSense)”.

The product direction is now dashboard-first:

- The core loop is **learning telemetry** emitted continuously during learning.
- The primary value is **Today / Week / Heatmap dashboards** with source/topic breakdowns.
- Captures (“term” / “question”) remain useful, but should not be required for core value.

We also want a **portable** user-owned history (export), and privacy-first defaults.

## Decision

Make the product core **events-first**:

- The canonical store is an append-only `Event` stream (events → sessions → rollups → dashboards).
- A **desktop-first Chrome extension** is the primary event emitter.
- MVP event types include:
  - `artifact_active` (heartbeat)
  - `capture` (`term | question`)
  - optional: `topic_override`, `aha_candidate`
- MVP API surface is centered on:
  - ingest: `POST /events/ingest`
  - read models: `GET /api/dashboard/today`, `/api/dashboard/week`, `/api/dashboard/heatmap`
  - portability: `GET /events/export`
- Topics are a small fixed set for MVP (foundations/backend/frontend/dx-tooling/deep-concepts), with a pipeline that can evolve from rules → heuristics → async AI → manual overrides.
- Term/TermSense becomes **legacy / optional enrichment** and must not block the telemetry MVP.

## Consequences

- The dashboard becomes the primary UX surface and “shipping milestone”.
- The data model and derived read models are oriented around sessionization + daily rollups (rebuildable from events).
- Several prior ADRs describing Term/TermSense as the core model are no longer current and are marked superseded.

## Superseded ADRs

This decision supersedes (telemetry MVP no longer depends on these designs):

- ADR 0002 (Term/TermSense duplicates)
- ADR 0003 (bucket feed over TermSense)
- ADR 0007 (suggestions stored on Candidate)
- ADR 0008 (accept-all idempotency via Candidate materialization pointers)
- ADR 0012 (custom user buckets)
- ADR 0017 (Term + TermSense edits)

## Alternatives considered

- Continue term-first: rejects the dashboard-first value proposition and delays “always-on” telemetry.
- Capture-only without heartbeats: too sparse to power reliable rollups and streaks.
- Store full URLs by default: higher privacy risk; default should be host + URL hash with explicit opt-in for full URLs.
