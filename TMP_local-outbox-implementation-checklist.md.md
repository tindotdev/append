---
temporary: true
created: 2026-01-03
---

> TEMPORARY FILE

# Outbox Implementation Checklist (v1)

**Epic outcome:** Instant capture submit (queue-now, open-later) + durable retry-safe delivery + best-effort single-sender across tabs/windows + short Undo grace window.

**Scope (v1):** outbox only for **capture terms** (`POST /api/batch`). No outbox for accept-all.

---

## 0) Decisions + docs (sign-off blockers)

### T0. ADR (done): Outbox-backed capture semantics (supersedes ADR 0016 submit semantics)

**Scope**
- Captured in:
  - `docs/adr/0018-outbox-backed-capture-semantics.md`
- ADR 0016 is marked as partially superseded for submit semantics:
  - `docs/adr/0016-web-ui-capture-term-composer.md`

**Acceptance**
- ✅ Done.

**Tests**
- None.

### T1. Defaults + user scoping (done)

**Scope**
- Defaults (v1):
  - `UNDO_GRACE_MS = 5_000`
  - `LEASE_MS = 10_000`
  - `HEARTBEAT_MS = 3_000`
  - `BACKOFF_BASE_MS = 1_000`
  - `BACKOFF_CAP_MS = 60_000`
  - `JITTER_MS = random(0..250)`
- User scoping (per ADR 0018):
  - use a per-user IndexedDB database name derived from the stable user ID (e.g. `session.user.id`), not email.

**Acceptance**
- Values + scoping approach are written in the ADR from T0 (or a small follow-up ADR if needed).

**Tests**
- None.

---

## 1) Outbox core (web `src/lib/outbox/*`)

### T2. Types + interfaces + state machine ✅

**Scope**
- Define:
  - `OutboxCommand` union (v1: `capture_terms` only)
  - `OutboxItem` shape (includes `undoUntil`, `nextAttemptAt`, `status`, `lastError`)
  - status enum: `pending | failed | blocked_auth`
- Define DI boundaries:
  - `now()`, `sleep(ms)`, `logger?`, `broadcast`, `store`, `sendCommand(command)`

**Acceptance**
- ✅ Immutable command payload after enqueue.
- ✅ Sender is single-flight (no concurrent sends).
- ✅ No durable `sending` state (or explicit crash recovery plan if introduced).

**Implementation**
- `packages/web/src/lib/outbox/types.ts` - All type definitions
- `packages/web/src/lib/outbox/constants.ts` - Configuration constants

**Tests (unit, Vitest)**
- ✅ Pure tests for retry/backoff helpers (deterministic jitter injection).
- See `error-classifier.test.ts` - 39 tests

### T3. IndexedDB OutboxStore (persistence + queries) ✅

**Scope**
- Implement IDB schema + versioning.
- Provide methods:
  - `put/get/delete`
  - `listDue(now, userScope)` (ordered, pending only)
  - `countByStatus(userScope)`
  - `listByStatus(userScope, status)` (for failure UI)

**Acceptance**
- ✅ Reload preserves queued items.
- ✅ `listDue` ordering is deterministic.
- ✅ Works with multiple open tabs (per-user database isolation).

**Implementation**
- `packages/web/src/lib/outbox/store.ts:23` - `createOutboxStore(userScope)`
- Per-user database: `outbox_${userScope}`
- Compound index `by_status_nextAttempt` for efficient `listDue` queries

**Tests**
- ✅ Unit tests using fake-indexeddb + mock store
- See `store.test.ts` - 24 tests
- Manual: enqueue → refresh → item remains (deferred to integration)

### T4. Retry + error classification helpers ✅

**Scope**
- Define helpers:
  - retryable: network errors, 408, 429, 500–599
  - blocked: 401/403 → `blocked_auth`
  - permanent fail: 400 `VALIDATION_ERROR`, 409 `IDEMPOTENCY_CONFLICT`, 413, etc.
- Backoff: exponential + cap + jitter.

**Acceptance**
- ✅ Matrix matches repo's real API error contract (status + `error.code` shape).

**Implementation**
- `packages/web/src/lib/outbox/error-classifier.ts`
- `isRetryableStatus()`, `isAuthBlocked()`, `isPermanentFailure()`
- `classifyResponse()` - unified classifier
- `calculateNextAttemptAt()` - exponential backoff with DI for jitter

**Tests (unit)**
- ✅ Status matrix tests (including 200/201 success paths).
- See `error-classifier.test.ts` - 39 tests

### T5. BroadcastChannel wrapper (`kick`, `outbox_changed`, `outbox_result`) ✅

**Scope**
- Add a small wrapper:
  - publish/subscribe
  - message types:
    - `{ type:"kick" }`
    - `{ type:"outbox_changed", userScope }`
    - `{ type:"outbox_result", userScope, result:{ type:"capture_terms", itemId, batchId } }`

**Acceptance**
- ✅ Followers update counts without polling (react to `outbox_changed`).

**Implementation**
- `packages/web/src/lib/outbox/broadcast.ts`
- `createOutboxBroadcast()` - real BroadcastChannel
- `createMockBroadcast()` - in-memory mock for testing

**Tests**
- ✅ Unit: message encoding/decoding and handler dispatch.
- See `broadcast.test.ts` - 11 tests

### T6. Sender loop (`sendOne` + scheduler) ✅

**Scope**
- Implement:
  - `sendOne(item)` for `capture_terms` (POST `/api/batch` with `{ terms, clientRequestId }`)
  - loop that processes due items FIFO, one-at-a-time
  - wake scheduling for next due time
- Ensure correctness:
  - respects `undoUntil` by setting `nextAttemptAt = undoUntil` for attempt #0
  - never leaves items stuck after crashes (avoid durable `sending`, or "unstick")
  - on success: delete item + broadcast `outbox_changed` + `outbox_result`
  - on retryable: update attempt + nextAttemptAt + lastError
  - on blocked_auth: mark blocked + pause loop until auth resumes
  - on failed: mark failed + lastError

**Acceptance**
- ✅ Undo window prevents any send attempt before eligible time.
- ✅ 401/403 does not permanently fail items.
- ✅ No "stuck sending" class of bugs.

**Implementation**
- `packages/web/src/lib/outbox/sender.ts`
  - `createCommandSender()` - dispatches to POST /api/batch
  - `createSenderLoop()` - FIFO processing with transitions
  - `createEnqueueHelper()` - sets undoUntil + nextAttemptAt
  - `createUndoHelper()` - deletes item if within grace window
- `packages/web/src/lib/outbox/create-outbox.ts` - factory

**Tests (unit)**
- ✅ Transition tests:
  - 201/200 → delete + result broadcast
  - network error / 429 / 503 → retry schedule
  - 401 → blocked_auth
  - 400 VALIDATION_ERROR → failed
  - 409 IDEMPOTENCY_CONFLICT → failed
- See `sender.test.ts` - 35 tests

---

## 2) Cross-tab leadership (single sender)

### T7. Web Locks leadership (primary) ✅

**Scope**
- Acquire `navigator.locks` lock `outbox-sender` (ifAvailable).
- If leader: run "send until idle", then release the lock (acquire again on next wake trigger).

**Acceptance**
- ✅ In two tabs, only leader sends (best-effort).

**Implementation**
- `packages/web/src/lib/outbox/leadership/web-locks.ts` - `createWebLocksProvider()`
- Uses `navigator.locks.request()` with `{ mode: 'exclusive', ifAvailable: true }`
- Holds lock via Promise that resolves when `release()` is called

**Tests**
- ✅ Unit: leadership session logic with mocked lock manager.
- See `leadership/__tests__/web-locks.test.ts` - 11 tests
- Manual multi-tab QA: verify only one tab sends (deferred to integration).

### T8. IndexedDB lease fallback (when Web Locks unavailable) ✅

**Scope**
- Lease row in IDB:
  - `tryAcquire/renew`
  - TTL + heartbeat
- Takeover after expiry.

**Acceptance**
- ✅ Closing leader allows takeover after `LEASE_MS`.

**Implementation**
- `packages/web/src/lib/outbox/leadership/lease.ts` - `createLeaseStore()`, `createLeaseProvider()`
- `packages/web/src/lib/outbox/leadership/types.ts` - `LeadershipSession`, `LeadershipProvider`, `LeaseRecord`, `LeaseStore`
- `packages/web/src/lib/outbox/leadership/index.ts` - `createLeadershipProvider()` factory with auto-fallback
- IDB schema v2 adds `leadership_lease` object store (`constants.ts`, `store.ts`)

**Tests (unit)**
- ✅ Lease acquire/renew/expire with fake clock.
- See `leadership/__tests__/lease.test.ts` - 24 tests

---

## 3) App + UX integration

### T9. App bootstrap + outbox status source

**Scope**
- Start the outbox system from an app-level place (e.g. `packages/web/src/providers.tsx`) and make it StrictMode-safe.
- Expose derived status (pending/failed/blocked counts) via context/hook.
- On `outbox_result`:
  - invalidate batches list
  - optionally prefetch `GET /api/batch/:id`

**Acceptance**
- No double-start/double-send under StrictMode.
- Counts update across tabs via `outbox_changed`.

**Tests**
- Unit: derived status selector logic.

### T10. Global header chip indicator

**Scope**
- Add a compact indicator to `AppShell` header:
  - `Syncing…` (pending > 0 and online)
  - `Offline — will sync` (pending > 0 and offline)
  - `Needs attention` (failed > 0)
  - `Sign in to sync` (blocked_auth > 0)

**Acceptance**
- Indicator reflects persisted state across reload and across tabs.

### T11. Capture submit integration + Sonner Undo toast

**Scope**
- Update `/batch/new` submit:
  - enqueue `capture_terms` outbox item (no direct API call)
  - clear composer immediately
  - toast `Queued for sync` with **Undo**
- Undo action (only within grace window):
  - delete the outbox item
  - restore draft composer from `terms`
  - broadcast `outbox_changed`

**Acceptance**
- Submit is instant offline.
- Undo reliably prevents any network send (because item is not eligible before `undoUntil`).
- Undo restores draft.

### T12. “Batch ready → Open” toast on ACK (hybrid UX)

**Scope**
- When `outbox_result` arrives:
  - if user is on `/batch/new`, show toast `Batch ready` with **Open** action navigating to `/batch/:id`.

**Acceptance**
- No surprise redirects; user opts in to opening the batch.

### T13. Failed/blocked item management UI (minimal)

**Scope**
- Provide a minimal surface (e.g. Settings page section) to:
  - list failed items (error message + timestamp)
  - list blocked_auth items (prompt to sign in)
  - discard items (delete by id; broadcast `outbox_changed`)

**Acceptance**
- User can clear “Needs attention” state and unblock the system.

---

## 4) Testing plan (choose the repo-appropriate path)

### T14. Unit tests (web Vitest) ✅ (T2-T8 coverage complete)

**Scope**
- Add unit coverage for:
  - ✅ backoff + classifier
  - ✅ sender transitions
  - ✅ lease logic

**Acceptance**
- ✅ Covers the state machine and the high-risk error/transition paths.

**Implementation**
- `packages/web/vitest.config.ts` - Vitest configuration
- `packages/web/src/test/setup.ts` - Test setup with fake-indexeddb + BroadcastChannel mock
- `packages/web/src/lib/outbox/__tests__/` - 109 tests (core)
  - `error-classifier.test.ts` - 39 tests
  - `store.test.ts` - 24 tests
  - `broadcast.test.ts` - 11 tests
  - `sender.test.ts` - 35 tests
- `packages/web/src/lib/outbox/leadership/__tests__/` - 35 tests (leadership)
  - `lease.test.ts` - 24 tests
  - `web-locks.test.ts` - 11 tests

**Total**: 144 tests

### T15. Add Playwright (minimal) to web

**Scope**
- Add `@playwright/test` to `packages/web` and minimal config.
- Add an e2e runner script for web (e.g. `pnpm --filter @append/web test:e2e`).

**Acceptance**
- Playwright runs locally against the dev server or preview build.
- Tests can run without real auth/backend by routing:
  - `**/auth/get-session` (or equivalent) to return a stubbed session
  - `**/api/batch` to return a stubbed 200/201 JSON response

### T16. Playwright: single-sender guarantee (Web Locks path)

**Scope**
- Open two pages (same origin), enqueue one outbox item via `/batch/new`.
- Use a test override to keep the Undo window short (e.g. `UNDO_GRACE_MS=50`) so the test doesn’t wait ~5s.
- Intercept `POST /api/batch` across both pages and count requests.
- Assert exactly **1** `POST /api/batch` occurs.

**Acceptance**
- Passes reliably (no flakes across runs).

### T17. Playwright: single-sender guarantee (lease fallback path)

**Scope**
- Same as T16, but disable Web Locks in both pages via init script (force lease fallback).
- Assert exactly **1** `POST /api/batch` occurs.

**Acceptance**
- Passes reliably (no flakes across runs).

---

## Definition of Done (v1)

- Capture submit queues instantly and clears composer on enqueue.
- Undo cancels queued items before eligible-to-send and restores draft.
- Cross-tab: single sender best-effort (locks + lease fallback) + UI updates via BroadcastChannel.
- Retries/backoff work; failures and blocked auth are visible and manageable.
- Tests: unit coverage for core transitions; Playwright T16–T17 pass.
