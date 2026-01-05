# ADR 0018 — Outbox-backed capture semantics (queue now, open later, undo)

Status: Accepted  
Date: 2026-01-03

Supersedes: ADR 0016 (submit semantics only — the row composer UI remains)

## Context

The `/batch/new` capture flow is optimized for “fast capture now, review later” (ADR 0016). However, the current submit path still has two UX shortcomings:

1. **Network-coupled submit**: Users must wait for `POST /api/batch` to succeed before the UI can complete the action (clear + navigate).
2. **No safe cancel**: Accidental submits have no low-risk “oops” escape hatch.

We want a more Linear-like feel:

- submit should be instant even when offline or flaky
- delivery should be durable and retry-safe
- cross-tab should not double-send
- retries must never create duplicates (server-side idempotency remains the backstop)

Constraints to preserve:

- Keep the existing backend contract for capture terms:
  - `POST /api/batch` with JSON `{ terms: string, clientRequestId: uuid }`
  - server idempotency is keyed by `clientRequestId` plus request-hash conflict detection
- Do not introduce a server-side “draft batch” state machine (ADR 0016 non-goal).
- Avoid cross-user leakage on shared devices/browsers (even though this is a personal app).

## Decision

### 1) Introduce a client-side Outbox for capture terms

On submit, the client enqueues an outbox item representing the command:

- `type: "capture_terms"`
- `request: { terms, clientRequestId }`

The sender (leader-only) later executes the command via the existing endpoint `POST /api/batch`.

### 2) Hybrid UX: queue immediately, don’t auto-redirect

**On Submit (always instant):**

1. Persist the outbox item.
2. Clear the composer immediately (the draft is now committed to durable outbox storage).
3. Stay on `/batch/new` (no auto-redirect).
4. Show a toast: `Queued for sync` with **Undo**.
5. Show a global indicator (header chip) derived from outbox counts.

**When the server ACK arrives:**

- Show a toast `Batch ready` with **Open** action (navigate to `/batch/:id`).
- Invalidate and/or prefetch batch queries best-effort.

### 3) Undo semantics (cancel-before-send only)

Undo must never claim success after the request has already become eligible to send.

To make Undo correct:

- Each queued item gets an `undoUntil` timestamp (default 5 seconds after enqueue).
- The initial `nextAttemptAt` is set to `undoUntil`, making the item **ineligible to send** during the grace window.

If the user taps **Undo** before `undoUntil`:

- delete the outbox item
- restore the composer draft from the queued payload (`terms` string)

Undo is not supported once sending begins or once the server has ACKed the capture (at that point the only safe action is “Open”).

### 4) Error classification (outbox sender)

- Retryable: network errors, 408, 429, 500–599
- Blocked-on-auth: 401/403 → mark as `blocked_auth` and pause until auth is valid again
- Permanent failure: 400 `VALIDATION_ERROR`, 409 `IDEMPOTENCY_CONFLICT`, 413, etc. → mark as `failed` and require user discard

Retry/backoff defaults (v1):

- `BACKOFF_BASE_MS = 1_000`
- `BACKOFF_CAP_MS = 60_000`
- `JITTER_RANGE_MS = random(0..250)`

### 5) Cross-tab coordination

- Single sender per origin:
  - primary: Web Locks (`navigator.locks`) with `outbox-sender`
  - fallback: IndexedDB lease with TTL + heartbeat
- Cross-tab messaging uses BroadcastChannel for:
  - `kick` (wake leader scheduling)
  - `outbox_changed` (refresh counts/indicator across tabs)
  - `outbox_result` (drive “Batch ready → Open” UX)

Server-side idempotency remains the correctness backstop if a rare double-send happens.

Leadership defaults (v1):

- Web Locks is primary; IDB lease is used only when Web Locks is missing or throws.
- Lock-holding strategy: hold the lock only while actively running “send until idle”, then release when idle (reduces frozen-background-tab issues on mobile).

Lease fallback defaults (v1):

- `LEASE_MS = 10_000` (10s)
- `HEARTBEAT_MS = 3_000` (~ lease / 3)

### 5.1) Testing (v1)

Add Playwright with minimal multi-tab coverage:

- Single-sender test (Web Locks path): open two pages, enqueue once, assert only one `POST /api/batch`.
- Single-sender test (lease fallback path): same test, but disable `navigator.locks` via init script; still only one `POST /api/batch`.

### 6) User scoping (prevent cross-user leakage)

Outbox persistence is scoped per signed-in user:

- Use a per-user IndexedDB database name derived from the stable user ID (e.g. `session.user.id`), not email.
- Sender only processes items for the current user scope.

## Consequences

### Positive

- Capture submit becomes instant and durable (offline-friendly).
- Undo provides a low-risk safety net without violating “submit is final after ACK”.
- Cross-tab behavior is robust: best-effort single sender, plus server idempotency.
- Clear, inspectable failure modes (`failed`, `blocked_auth`) with explicit user actions.

### Negative / risks

- Adds meaningful client complexity (IDB, leadership, retries, cross-tab messaging).
- Requires careful StrictMode-safe bootstrapping and crash recovery posture (avoid durable `sending`; on startup all pending items are eligible to retry).
- Requires a management surface for failed/blocked items.

### Failure modes & recovery

- **IndexedDB unavailable/corrupt/quota exceeded**: outbox initialization can fail; the app should continue to render, show a toast, and keep capture disabled until storage is available again.
- **Crash recovery**: no durable `sending` state is used; items remain `pending` and are retried when the sender loop resumes.

## Alternatives considered

1. **Keep direct submit** — rejected: remains network-coupled and not durable.
2. **Auto-redirect after ACK** — rejected: undermines “instant” feel and surprises navigation.
3. **Allow Undo without grace window** — rejected: creates race where we “undo” after sending begins.
4. **Service Worker background sync** — deferred: higher complexity and platform limitations; not required for v1.

## Related

- Design snapshot: `docs/design.md`
- ADR 0016: capture row composer UI (submit semantics superseded): `docs/adr/0016-web-ui-capture-term-composer.md`
- API idempotency approach: see capture use case `POST /api/batch` (implementation in `packages/api/src/features/batch/usecases/captureTerms.ts`)
