# Append — Design (WakaTime for learning)

## What this product is

Append is **WakaTime-for-learning**:

- A **desktop-first Chrome extension** emits learning telemetry while you read/watch/build.
- The **dashboard is the product**: Today / Week / Heatmap, plus top sources/topics and captures.
- The core is **append-only events** (events → sessions → rollups → dashboards).
- “Terms/TermSense” is **not required** for MVP; it becomes optional capture/enrichment views (see Appendix).

## Decisions (current)

- Product core: events-first learning telemetry + dashboard-first UX (ADR: `docs/adr/0020-events-first-learning-telemetry.md`).
- Canonical store: events-first in `append` (append-only; derived rollups are rebuildable).
- App architecture: SPA (React + TanStack Router) + Hono on Cloudflare Workers (ADR: `docs/adr/0004-spa-hono-workers.md`).
- Auth/access: Google SSO allowlist (ADR: `docs/adr/0001-google-allowlist-auth.md`).
- Web UI: Linear-style sidebar layout (ADR: `docs/adr/0015-web-ui-linear-sidebar-layout.md`).
- Capture UX: outbox-backed submit semantics (ADR: `docs/adr/0018-outbox-backed-capture-semantics.md`) applied to capture events (not Term entities).

## North-star outcome

“I can open the dashboard any day and immediately see where my learning time went (sources + topics), what I captured, and whether I’m building a streak.”

## Principles

- **Events are append-only**: corrections are new events (or explicit override events), not silent rewrites.
- **Estimated is okay**: learning minutes are a best-effort estimate; show the estimation clearly.
- **Privacy-first defaults**: collect the minimum needed to power dashboards; prefer hashing/redaction.
- **Dashboard-first UX**: if it doesn’t improve Today/Week/Heatmap, it’s not MVP.

## Core loop (events-only)

1. Extension emits `artifact_active` heartbeats while the user is actively learning.
2. The API ingests events (idempotent) and writes them to D1 append-only tables.
3. Server derives sessions + daily rollups (sync on read for MVP; background jobs later).
4. Dashboard reads rollups + recent captures and renders Today/Week/Heatmap views.
5. Optional enrichment (later): topic classification improvements, `aha_candidate`, capture-derived term views.

MVP rollups posture:

- Today/Week/Heatmap compute rollups **on read** from `Event` for the requested range.
- Materialized `Daily*Rollup` tables are optional optimizations later.

## Domain glossary

- **Artifact**: the “thing being learned from” (for MVP: a web page URL + host).
- **Event**: an immutable fact emitted by a client (extension/web). Stored append-only.
- **Session**: a contiguous window of activity derived from heartbeats.
- **Rollup**: derived aggregates (daily totals, per-topic totals, per-source totals).
- **Topic**: the “language equivalent” (high-level learning category) used for breakdowns and streaks.
- **Capture**: a user-authored note created during learning (`term` or `question` for MVP).

## Event taxonomy (MVP)

All events share a common envelope:

- `schema_version` (integer; MVP: `1`)
- `event_id` (UUID; client-generated)
- `device_id` (extension install)
- `emitted_at` (client timestamp; ms)
- `received_at` (server timestamp; ms)
- `type`
- `artifact` (optional, typed; for MVP: `{ url_hash, host, path_hint?, title_hint? }`)
- `payload` (type-specific)

Artifact identity (MVP):

- `url_hash = sha256(normalize(url))` computed **client-side**
- `normalize(url)`:
  - strip fragment (`#...`)
  - strip query string (`?...`) _(recommended for MVP to reduce cardinality)_
  - lowercase host
  - keep path

### `artifact_active` (heartbeat) — required

Emitted on a fixed interval while the artifact is active.

Only emit heartbeats for `http://` and `https://` URLs (skip `chrome://`, `file://`, `about:blank`, extension pages, etc.).

- Payload:
  - `interval_ms` (e.g., 30_000)
  - `active_signals` (MVP: MV3-safe, no content script required):
    - `window_focused`: boolean
    - `tab_active`: boolean
    - `user_idle`: boolean (from `chrome.idle`)

### `capture` — required

A lightweight “bookmark for later” tied to an artifact.

- Payload:
  - `capture_type`: `term | question`
  - `label`: string (the term/question text)
  - `note?`: string (optional short context)

### `topic_override` — optional (MVP-compatible, not required to ship)

Explicitly assigns a topic to an artifact (or to a capture) for a time range.

- Payload:
  - `topic_slug`
  - `scope`: `artifact | capture | time_range`
  - `starts_at?`, `ends_at?`

### `aha_candidate` — optional (MVP-compatible, not required to ship)

Marks a moment that looks like an “aha” (user-initiated or heuristic).

- Payload:
  - `label` (short)
  - `reason`: `manual | heuristic | ai`

## Sessions + learning minutes (estimated)

Learning minutes are derived from `artifact_active` events and are **always an estimate**.

### Parameters (MVP defaults)

- `HEARTBEAT_INTERVAL_MS = 30_000`
- `IDLE_CUTOFF_MS = 300_000` (if gap > cutoff, treat as idle and start a new session)
- `MAX_CREDIT_PER_HEARTBEAT_MS = HEARTBEAT_INTERVAL_MS`

### Sessionization algorithm (MVP)

- Resolve `user_id` from authentication (server-side), then sort heartbeats by `(user_id, artifact, emitted_at)`.
- For each heartbeat:
  - If `active_signals.user_idle === true`, credit `0ms`.
  - If `active_signals.window_focused === false`, credit `0ms`.
  - If `active_signals.tab_active === false`, credit `0ms`.
  - Else:
    - Let `gap = emitted_at - prev_emitted_at` (for the same artifact).
    - If `gap <= IDLE_CUTOFF_MS`, credit `min(gap, MAX_CREDIT_PER_HEARTBEAT_MS)`.
    - Else, start a new session and credit `MAX_CREDIT_PER_HEARTBEAT_MS` (first heartbeat establishes activity).
- Per day (in a chosen timezone), sum credited milliseconds → **learning minutes**.

### Streak definition (MVP)

- A day is “active” if `learning_minutes >= 10` (threshold is a user-visible constant).
- Streak counts consecutive active days in the user’s timezone.

## Topics (language equivalent) + classification pipeline

Topics are a small, fixed set for MVP:

| Slug          | Name          | Description                                    |
| ------------- | ------------- | ---------------------------------------------- |
| foundations   | Foundations   | Core CS concepts, algorithms, data structures  |
| backend       | Backend       | Server-side patterns, APIs, databases, storage |
| frontend      | Frontend      | UI patterns, React, state management           |
| dx-tooling    | DX Tooling    | Build tools, migrations, CI/CD                 |
| deep-concepts | Deep Concepts | Systems thinking, architecture, tradeoffs      |

### Classification pipeline (progressive)

1. **Rules (sync)**: URL host/path allowlists (e.g., `docs.*` → likely `dx-tooling`), user-defined mappings.
2. **Heuristics (sync)**: keywords in title/path, referrer hints, time-of-day patterns (keep minimal in MVP).
3. **Async AI (later)**: model suggests `{topic_slug, confidence, rationale}` from redacted artifact hints.
4. **Manual override (always)**: `topic_override` events win over automated classification.

Precedence (highest → lowest):

- `topic_override` > user rule mapping > heuristic > AI suggestion > default

## API surface (MVP)

### Ingest

- `POST /events/ingest`
  - Auth: session/cookie/token; server derives `user_id` (client does **not** send it).
  - Body: `{ client_batch_id?, events: Event[] }`
  - Idempotency:
    - event-level dedupe is canonical: ignore duplicates by `(user_id, device_id, event_id)`
    - `client_batch_id` is optional “batch retry sugar” (not required if event-level dedupe is correct)
  - Response: `{ accepted, rejected, server_time_ms }`

### Dashboard queries

- `GET /dashboard/today?tz=Asia/Bangkok` (example; if omitted, default to the user’s configured timezone)
  - Returns: today minutes, 7-day average, streak, today breakdown (topics + sources), today captures, top topic/source.
- `GET /dashboard/week?start=YYYY-MM-DD&tz=...`
  - Returns: 7-day series + per-topic/per-source totals + top cards.
- `GET /dashboard/heatmap?year=YYYY&tz=...`
  - Returns: per-day minutes for the year + stats (total, avg/day, active days).

### Export (MVP “don’t die” requirement)

- `GET /events/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=ndjson`
  - User-owned export of raw events (portable, append-only).

## Data model (events-first; Cloudflare D1)

### Tables (conceptual)

- `User` (google_sub, email, created_at)
- `Device` (id, user_id, type=`chrome_extension`, installed_at, last_seen_at)
- `Event` (event_id, user_id, device_id, type, emitted_at, received_at, artifact_host, artifact_url_hash, artifact_path_hint?, title_hint?, payload_json)

Derived (computed on read for MVP; materialize later if needed):

- `Session` (id, user_id, starts_at, ends_at, artifact_host, artifact_url_hash, credited_ms)
- `DailyRollup` (user_id, day, tz, total_ms, active_minutes, streak_day_flag)
- `DailyTopicRollup` (user_id, day, tz, topic_slug, total_ms)
- `DailySourceRollup` (user_id, day, tz, source_host, total_ms)

### Indices (MVP)

- `Event(user_id, emitted_at)`
- `Event(user_id, artifact_url_hash, emitted_at)`

If/when rollups are materialized:

- `DailyRollup(user_id, day, tz)` (unique)
- `DailyTopicRollup(user_id, day, tz, topic_slug)` (unique)
- `DailySourceRollup(user_id, day, tz, source_host)` (unique)

## Dashboards (Today / Week / Heatmap)

The dashboard composition follows the current UI prototype:

- Row 1: Today hero (minutes + 7d avg) · Streak · Top source
- Row 2: Today breakdown (topics + sources) · Today captures · Top topic
- Row 3: Week chart (7-day bar)
- Row 4: Activity heatmap (year view + stats)

Key cards (MVP):

- **Today minutes** + comparison to 7-day average
- **Streak** (min threshold visible)
- **Top source** (by minutes, week)
- **Top topic** (by minutes, week)
- **Captures today** (term/question list)

UX prototyping note:

- The current web UX prototype includes a local telemetry simulator to drive these dashboards without any backend/API dependencies.
- Production replaces this with the real `/dashboard/*` queries backed by ingested events.

## Browser extension (emitter)

### Responsibilities (MVP)

- Generate a stable `device_id` (UUID) and persist it in `chrome.storage.local`.
- Emit `artifact_active` heartbeats on an interval while:
  - the tab is active/visible and focused, and
  - the user shows activity (minimal set of input/visibility signals).
- Allow quick `capture` creation (term/question) tied to the current artifact.
- Batch and retry event upload to `/events/ingest` (offline-tolerant; idempotent).

### Minimal permissions (MVP target)

- `tabs` (read active tab URL periodically for heartbeats)
- `storage` (queue/outbox)
- No blanket content scraping; no reading page bodies by default.

## Privacy

Defaults for MVP:

- The extension reads the current tab’s full URL locally to compute a **client-side URL hash**.
- By default, upload/store **host** + **URL hash** only; do not store full URLs unless the user explicitly opts in.
- Treat titles/path hints as optional and redactable; never store page body content.
- Provide:
  - a clear “what we collect” statement in-app,
  - an export endpoint (`/events/export`) so the user always owns their history.

## Milestones

### M0 — Instrumentation skeleton (extension + ingest)

- `artifact_active` heartbeats emitted and ingested end-to-end.
- D1 `Event` table exists; duplicates are safely ignored.

### M1 — Dashboard MVP (ship the product)

- Today / Week / Heatmap endpoints return real rollups.
- Dashboard UI renders real data (not mock).
- Captures (`term`/`question`) recorded and visible on Today.
- `/events/export` implemented with real data.
- Privacy statement shipped.

### M2 — Better topics + enrichment (optional)

- Rules/heuristics topic classification in production.
- Manual overrides (`topic_override`) wired end-to-end.
- Optional async AI classification behind a flag.
- Optional `aha_candidate` events and views.

## Definition of Done for MVP (ship and not die)

- [ ] Chrome extension emits heartbeats reliably (foreground use).
- [x] `/events/ingest` stores real events and dedupes by `(user_id, device_id, event_id)`.
- [ ] Today/Week/Heatmap dashboards show real totals and breakdowns.
- [ ] `/events/export` works and is documented in-app.
- [ ] Privacy statement exists and matches actual collection.

## Appendix — Legacy / optional enrichment: Term + TermSense

Term/TermSense is **not required** for MVP telemetry.

If retained, it must be framed as **derived views** over events:

- `capture(term)` events are the source of “terms” (user-authored).
- `aha_candidate` and (later) extraction jobs may propose additional terms/questions.
- “Sense” becomes an optional enrichment note attached to a capture (not a canonical entity).

The previous “capture → suggest → accept → term/sense” loop is a legacy direction and should not block telemetry MVP shipping.
