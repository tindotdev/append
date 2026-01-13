# PR #39 Review Comments

## Critical Issues

#### 1. SQL Injection Risk in Export Endpoint

**Location**: `packages/api/src/features/events/routes.ts:242-247`

While this appears safe (using static column references), ensure Drizzle is generating proper SQL with explicit ordering direction.

#### 2. Timezone Handling Edge Case

**Location**: `packages/api/src/features/dashboard/rollups/time.ts:72-126`

The `parseDayKeyToTzRange` function uses a single-iteration offset calculation that may fail for timezones with unusual DST transitions (e.g., Lord Howe Island, which shifts by 30 minutes). Consider adding a convergence loop to ensure accuracy.

### High Priority Issues

#### 3. Missing Input Validation in `computeCreditIndex`

**Location**: `packages/api/src/features/dashboard/rollups/credit.ts:50-67`

The function validates that rows are sorted but doesn't validate that all rows belong to the same user. Add assertion to prevent data leakage if called with mixed-user events.

#### 4. Potential Memory Issue in Export Streaming

**Location**: `packages/api/src/features/events/routes.ts:258-290`

The `toProcess` array could contain up to `PAGE_SIZE` (1000) rows. For large payloads, this could spike memory usage. Recommend streaming row-by-row instead of batching.

#### 5. Error Handling: Swallowed Errors in Export

**Location**: `packages/api/src/features/events/routes.ts:303-312`

The catch block logs the error but silently ignores write failures if the client has disconnected. Add structured logging or metrics for better debugging.

### Medium Priority Issues

#### 6. Hardcoded Constants Should Be Configurable

**Location**: `packages/api/src/features/dashboard/usecases/getDashboardToday.ts:21-24`

Constants like `MAX_EVENTS_PER_REQUEST`, `PAGE_SIZE`, `STREAK_PAGE_DAYS`, and `MAX_STREAK_DAYS` should be moved to config files or environment variables.

#### 7. Capture Type Mismatch Between Extension and API

**Location**: `packages/extension/src/lib/capture.ts`

The extension correctly supports `term` and `question` capture types. Add runtime validation to ensure only these types are sent in M1.

#### 8. Database Migration Missing Rollback Script

**Location**: `packages/api/drizzle/0009_parched_colonel_america.sql`

Create a rollback migration for the index changes.

---

## Comment 2: Codex Code Review (github-actions[bot])

**Findings**

`packages/api/src/features/events/routes.ts:212-299` – `/events/export` stops streaming after `MAX_TOTAL_ROWS = 100_000` rows and returns 200 with no cursor/flag. For users with >100k events in range, exports are silently truncated, which breaks the "user-owned export" promise and can mislead downstream tooling.

**Recommendation**: Surfacing a hard error (e.g., 413 with details), or returning a continuation cursor/`has_more` hint so clients know to page.

---

## Comment 3: Codex Code Review (github-actions[bot])

**Findings**

1. `packages/api/src/features/dashboard/usecases/getDashboardToday.ts:243-259`, `getDashboardWeek.ts:145-155`, `getDashboardHeatmap.ts:120-124` – Topic overrides are only loaded from the same time window as the heartbeat query. Overrides emitted before the window (e.g., a long-lived artifact override set last month) are dropped, so those artifacts fall back to heuristics during streak/today/week/heatmap calculations.
   - **Recommendation**: Pull overrides without the date filter (or persist a durable mapping) so persistent overrides still apply.

2. `packages/api/src/features/events/routes.ts:212-299` – `/events/export` stops streaming after `MAX_TOTAL_ROWS` (100k) but still returns 200 and provides no cursor/flag/error, so callers will silently receive a truncated export on large accounts.
   - **Recommendation**: Return a 413 with metadata or at least a trailer/header/body flag plus next-cursor so clients can detect and resume. Add a test that covers the truncation case.

**Test Coverage Gap**: No coverage for persistent overrides and export truncation detection.
