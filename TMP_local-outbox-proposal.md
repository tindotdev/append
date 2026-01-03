---
temporary: true
created: 2026-01-03
---

> TEMPORARY FILE

## Proposal: Local Outbox + Cross-Tab Leader Sender for **Capture Terms** (`POST /api/batch`)

### Status

Aligned to ADR 0018 (approved) and ready for implementation.

### Goals

- **Instant UI**: submit queues immediately; UI does not block on network.
- **Undo safety net**: allow a short grace window to cancel a queued item **before it’s eligible to send** (no “pretend-undone after send” races).
- **Durable submission**: queued items survive refresh/crash/offline.
- **Reliable delivery**: automatic retries with exponential backoff.
- **No duplicates**: rely on existing server idempotency (`clientRequestId` + request hash conflict detection).
- **Cross-tab safety**: only one sender runs per origin (Web Locks primary, IDB lease fallback).

### Non-goals (v1)

- Multi-device offline edits, CRDTs, conflict resolution.
- Service Worker background sync / periodic sync.
- Outbox for accept-all.
- Undo after a send begins or after server ACK (Undo becomes “Open” only).

---

## User Experience (canonical decision)

### Capture submit: Hybrid (queue now, open later)

**On Submit (always instant):**

1. Enqueue a `capture_terms` outbox command (real contract: `POST /api/batch` body `{ terms, clientRequestId }`).
2. Clear the composer immediately (the draft is committed to durable outbox storage).
3. Stay on `/batch/new` (no auto-redirect).
4. Show Sonner toast: `Queued for sync` with **Undo** (grace window 3–5s; default 5s).
5. Header chip reflects outbox: `Syncing…` / `Offline — will sync` / `Needs attention` / `Sign in to sync`.

**When ACK arrives:**

- Sender broadcasts `outbox_result { type:"capture_terms", itemId, batchId }`.
- If user is on `/batch/new`: show toast `Batch ready` with **Open** action (navigate to `/batch/:id`).
- Invalidate/prefetch batch queries (best-effort).

### Undo semantics (cancel before eligible-to-send)

To avoid “we already sent it but we pretended we undid it”:

- On enqueue, set a grace window where the item is **not eligible to send**:
  - Persist `undoUntil = now + 5000`
  - Set `nextAttemptAt = undoUntil` for attempt #0
- Undo action is available only until `undoUntil`.
- If user taps Undo in-window:
  - delete the outbox item
  - restore the draft composer from the queued payload (`terms` string)
  - broadcast `outbox_changed`

---

## Architecture Overview

### Components

1. **Outbox Store (IndexedDB)**
   - Persistent queue of outbox items plus retry metadata.
   - Indexed queries for “due items” and status counts.

2. **Sender loop (leader only)**
   - Single-flight processing of due items (FIFO).
   - Retry/backoff, error classification, and result broadcast.
   - Prefer no durable `sending` state (or include explicit “unstick” recovery).

3. **Cross-tab leadership**
   - Primary: Web Locks API exclusive lock.
   - Fallback: IndexedDB lease with TTL + heartbeat.

4. **Cross-tab messaging**
   - BroadcastChannel for:
     - `kick` (wake leader scheduling)
     - `outbox_changed` (refresh counts/indicator across tabs)
     - `outbox_result` (offer “Open batch” UX)

5. **Server (existing)**
   - `POST /api/batch` with JSON body `{ terms: string, clientRequestId: uuid }`
   - Returns 201 (new) / 200 (replay) / 409 `IDEMPOTENCY_CONFLICT` / 400 `VALIDATION_ERROR` / 413 `PAYLOAD_TOO_LARGE`

---

## Data Model (client)

### OutboxCommand (v1)

- `capture_terms`:
  - `request.terms: string` (newline-separated)
  - `request.clientRequestId: string` (uuid)

### OutboxItem

- `id: string` (uuid)
- `userScope: string` (stable per signed-in user; prevents cross-user leakage)
- `command: OutboxCommand`
- `createdAt: number`
- `updatedAt: number`
- `undoUntil: number`
- `status: "pending" | "failed" | "blocked_auth"`
- `attemptCount: number`
- `nextAttemptAt: number`
- `lastError?: { status?: number; code?: string; message: string }`

Notes:

- For v1, store the `terms` string directly on the item. Server already enforces `MAX_BODY_SIZE` and term count/length.
- Avoid durable `sending`. If introduced, implement “unstick on startup/leader acquire” to prevent stuck items after tab crash.

---

## Client Behavior Specification

### Enqueue (on Submit)

1. Generate `itemId` and `clientRequestId` (uuid).
2. Persist OutboxItem:
   - `undoUntil = now + UNDO_GRACE_MS` (default 5000)
   - `nextAttemptAt = undoUntil`
   - `attemptCount = 0`, `status = "pending"`
3. Clear composer immediately.
4. Show toast `Queued for sync` with **Undo** until `undoUntil`.
5. Broadcast:
   - `outbox_changed`
   - `kick`

### Undo (only while `now < undoUntil`)

1. Delete outbox item by `id`.
2. Restore composer draft from `command.request.terms`.
3. Broadcast `outbox_changed` (and optionally `kick`).

### Sender loop (leader only)

Processing:

- Fetch due items: `status="pending"` and `nextAttemptAt <= now`, oldest first.
- Send one at a time.

Command execution (`capture_terms`):

- POST `POST /api/batch` with JSON body `{ terms, clientRequestId }`.
- Classify result:
  - **Success**: 201 (new) or 200 (replay) → delete item; broadcast `outbox_changed` + `outbox_result(batchId)`.
  - **Retryable**: network errors, 408, 429, 500–599 → increment attempt, set future `nextAttemptAt`, keep `pending`.
  - **Blocked auth**: 401/403 → set `blocked_auth` and pause sending until auth resumes.
  - **Permanent fail**: 400 `VALIDATION_ERROR`, 409 `IDEMPOTENCY_CONFLICT`, 413, etc. → set `failed` and stop retrying that item.

Wake triggers:

- Broadcast `kick`
- `window.online`
- `visibilitychange` → visible
- timer for next due item
- auth becomes valid again (resume `blocked_auth`)

---

## Cross-Tab / Cross-Window Coordination

Lock name: `outbox-sender` (single sender per origin).

### Primary: Web Locks API

- Try `navigator.locks.request("outbox-sender", { mode: "exclusive", ifAvailable: true }, ...)`.
- If lock is granted, run “send until idle”, then release the lock (acquire again on next wake trigger).
- If denied, remain follower (no sending).

### Fallback: IndexedDB lease

Used only when Web Locks is unavailable or throws.

- Single-row lease: `{ lockName, ownerId, expiresAt, updatedAt }`.
- Acquire/renew in a single readwrite transaction.
- Heartbeat every `HEARTBEAT_MS` (~ `LEASE_MS / 3`).
- If leader crashes, another tab takes over after expiry.

### BroadcastChannel

Channel: `outbox`.

- `kick`: wake leader scheduling.
- `outbox_changed`: all tabs refresh counts/indicator.
- `outbox_result`: offer “Open batch” UX.

Correctness posture:

- Leadership prevents double-send best-effort; server idempotency remains the backstop.

---

## Observability & UI

Derived state:

- `pendingCount`, `failedCount`, `blockedAuthCount`
- `isLeader` (dev-only OK)

Header chip rules:

- pending > 0 and online → `Syncing…`
- pending > 0 and offline → `Offline — will sync`
- blockedAuth > 0 → `Sign in to sync`
- failed > 0 → `Needs attention`

---

## Testing Strategy (reality-aligned)

### Unit tests (Vitest)

- Backoff calculation + retryable classifier.
- Sender transitions (success/retry/blocked/permanent fail).
- Lease acquire/renew/expire logic (fake clock).

### Multi-tab verification

Add Playwright (minimal v1 scope):

- Single-sender test (Web Locks path): open two pages, enqueue once, assert only one `POST /api/batch`.
- Single-sender test (lease fallback path): same test, but disable `navigator.locks` via init script; still only one `POST /api/batch`.

---

## ADR impact (required before implementation sign-off)

Captured in ADR 0018 and the relevant portion of ADR 0016 is marked as superseded:

- `docs/adr/0018-outbox-backed-capture-semantics.md`
- `docs/adr/0016-web-ui-capture-term-composer.md`

---

## Open Questions

None (decisions captured in ADR 0018).

## Defaults (v1)

Leadership:

- `LEASE_MS = 10_000`
- `HEARTBEAT_MS = 3_000`

Backoff:

- `BACKOFF_BASE_MS = 1_000`
- `BACKOFF_CAP_MS = 60_000`
- `JITTER_MS = random(0..250)`
