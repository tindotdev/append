# ADR 0026 — Term suggestion quotas and global budget

Status: Accepted
Date: 2026-02-04

## Context

Term suggestions are the primary LLM-powered feature for public users (see ADR 0025). To prevent cost runaway and enable safe public release, we need:

1. **Per-user quotas**: Limit how many suggestions a single user can request
2. **Global budget**: Cap total LLM spending even if many users sign up
3. **Admin reservation**: Reserve capacity for demos and dogfooding without competing with public users
4. **Concurrency-safe enforcement**: Prevent quota bypass via parallel requests

The app runs on Cloudflare Developer plan (not free-tier), requiring explicit cost controls.

## Decision

### Per-user quotas

Each user account gets **3 term suggestions for their account lifetime**:

- **Scope**: Term suggestions (bucket + structured explanation)
- **No refunds**: Used quota is never reset or refunded
- **Enforcement**: At API boundary before calling LLM provider
- **Concurrency-safe**: Single D1 `UPDATE` with `WHERE` guard; check affected rows

### Global budget pool

Add a **monthly global budget** for term suggestions to cap total external LLM calls:

- **Total monthly cap**: 200 term suggestions
- **Shared pool**: 100/month (usable by all users, including admin)
- **Reserved pool**: 100/month (usable only by admin identity)
- **Window**: Fixed monthly window (UTC; 1st of month 00:00 → next month 00:00)
- **Circuit breaker**: If provider returns 429/quota error, disable suggestions for 15–60 minutes

### Pool consumption order (admin users)

Admin users consume from pools in this order:

1. Try **shared pool** first (same as public users)
2. If shared pool exhausted, fall back to **reserved pool**

This ensures admin capacity is available when needed but doesn't waste reserved quota when shared is available.

### Admin identity

Admin users are identified by Google `sub`:

- **Environment variable**: `ADMIN_SUB` (single admin at launch)
- **Future expansion**: `ADMIN_SUBS` (comma-separated) if multiple admins needed

### Quota enforcement flow

```
1. Check kill switch (SUGGESTIONS_ENABLED)
2. Check global budget (shared + reserved pools)
   - If exhausted: return 429 with SUGGESTIONS_BUDGET_EXHAUSTED + reset time
3. Check per-user lifetime quota (< 3 used)
   - If exhausted: return 429 with SUGGESTIONS_QUOTA_EXCEEDED
4. Atomic decrement: global pool + user quota in single transaction
5. Call LLM provider (cache hit skips all quota checks)
6. If LLM call succeeds: persist suggestion
7. If LLM call fails: quota already consumed (no refunds)
```

### Data model

#### User quota table

```sql
CREATE TABLE user_suggestion_quota (
  user_id TEXT PRIMARY KEY,
  lifetime_used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
```

#### Global budget table

```sql
CREATE TABLE llm_budget (
  feature TEXT PRIMARY KEY,  -- 'term_suggestion'
  window_start_ms INTEGER NOT NULL,
  window_ms INTEGER NOT NULL,  -- length of current monthly window (UTC)
  shared_used_count INTEGER NOT NULL DEFAULT 0,
  shared_limit_count INTEGER NOT NULL,  -- 100
  reserved_used_count INTEGER NOT NULL DEFAULT 0,
  reserved_limit_count INTEGER NOT NULL,  -- 100
  disabled_until_ms INTEGER,  -- Circuit breaker timestamp
  updated_at_ms INTEGER NOT NULL
);
```

### Atomic enforcement example

#### Per-user quota (concurrency-safe)

```typescript
// Increment user quota atomically
const result = await db.run(
 `
  UPDATE user_suggestion_quota
  SET lifetime_used_count = lifetime_used_count + 1,
      last_used_at_ms = ?,
      updated_at_ms = ?
  WHERE user_id = ?
    AND lifetime_used_count < 3
`,
 [now, now, userId],
);

if (result.changes === 0) {
 // Either user exhausted quota or concurrent request won
 return { error: "SUGGESTIONS_QUOTA_EXCEEDED" };
}
```

#### Global budget (concurrency-safe, admin-aware)

```typescript
// Try shared pool first
const sharedResult = await db.run(
 `
  UPDATE llm_budget
  SET shared_used_count = shared_used_count + 1,
      updated_at_ms = ?
  WHERE feature = 'term_suggestion'
    AND shared_used_count < shared_limit_count
    AND window_start_ms = ?
`,
 [now, currentWindowStart],
);

if (sharedResult.changes > 0) {
 return { pool: "shared", success: true };
}

// If admin and shared exhausted, try reserved pool
if (isAdmin) {
 const reservedResult = await db.run(
  `
    UPDATE llm_budget
    SET reserved_used_count = reserved_used_count + 1,
        updated_at_ms = ?
    WHERE feature = 'term_suggestion'
      AND reserved_used_count < reserved_limit_count
      AND window_start_ms = ?
  `,
  [now, currentWindowStart],
 );

 if (reservedResult.changes > 0) {
  return { pool: "reserved", success: true };
 }
}

return { error: "SUGGESTIONS_BUDGET_EXHAUSTED" };
```

### Provider configuration

Add support for **Google Gemini** as primary provider:

- **Environment variable**: `SUGGESTIONS_PROVIDER` (`gemini` | `openai` | `stub` | `disabled`)
- **Secret**: `GEMINI_API_KEY` (stored in Doppler → Cloudflare Secrets)
- **Structured output**: Continue using schema validation (valibot) for suggestion response
- **Cache**: Aggressive caching (never call provider on cache hit; bypass all quota checks)

### Suggestion output schema (v1)

Structured JSON validated at API boundary:

```typescript
{
 bucket_slug: string; // Must match existing user bucket
 aha_one_liner: string; // <= 140 chars
 explanation: string; // 2-4 sentences; <= 600 chars
 analogy: string; // <= 220 chars
 example: string; // Pseudocode/example; <= 700 chars
 check_question: string; // <= 180 chars
}
```

Storage: persist as `suggestedBucket` + single formatted `suggestedText` (Markdown) so UI renders without schema changes.

### Error responses

#### User quota exhausted

```json
{
 "error": "SUGGESTIONS_QUOTA_EXCEEDED",
 "message": "You have used all 3 lifetime suggestions for your account",
 "quota": {
  "used": 3,
  "limit": 3
 }
}
```

#### Global budget exhausted

```json
{
 "error": "SUGGESTIONS_BUDGET_EXHAUSTED",
 "message": "Suggestion budget temporarily exhausted. Try again after the next monthly reset",
 "reset_at": "2026-03-01T00:00:00Z"
}
```

### Web UI

Show quota status to users:

- **Before usage**: "3 AI suggestions available"
- **After usage**: "2 AI suggestions remaining"
- **Exhausted**: "You've used all 3 suggestions" + disable suggestion button
- **Global budget exhausted**: "Suggestions temporarily unavailable. Try again on [date]"

## Consequences

### Positive

- **Cost control**: Worst-case monthly LLM spend is 200 suggestions (bounded and predictable)
- **Abuse prevention**: Per-user lifetime cap prevents individual abuse; global cap prevents sign-up spam
- **Admin capacity**: Reserved pool ensures demos/dogfooding always work
- **No payment integration**: 3-lifetime cap is simple enough to not require billing
- **Concurrency-safe**: D1 atomic updates prevent quota bypass via parallel requests

### Negative

- **Hard caps**: Users cannot get more suggestions without admin intervention
- **No grace period**: Provider outages consume quota (no refunds)
- **Shared pool contention**: Global budget can be exhausted by early users in the month
- **Admin priority**: Admin's reserved pool is "use it or lose it" (doesn't accumulate)

### Mitigations

- Cache aggressively to reduce provider calls
- Clear UI messaging about quota limits before users try the feature
- Structured logging for quota exhaustion events (monitor demand)
- Kill switch (`SUGGESTIONS_ENABLED=0`) for emergency shutoff

## Implementation notes

### Migration

1. Add `user_suggestion_quota` table with `lifetime_used_count` column
2. Add `llm_budget` table with single row for `feature='term_suggestion'`
3. Initialize global budget: `shared_limit_count=100`, `reserved_limit_count=100`
4. Update suggestion API route to enforce both quotas atomically

### Operational

- **Admin identity**: Set `ADMIN_SUB` to Google `sub` of admin account
- **Provider secret**: Store `GEMINI_API_KEY` in Doppler and sync to Cloudflare Secrets
- **Monitoring**: Log quota exhaustion events (structured logs, no PII)
- **Kill switch**: `SUGGESTIONS_ENABLED=0|1` for emergency disable

### Window rotation

Add cron trigger (Cloudflare Workers Cron) to reset monthly window:

```typescript
import { eq } from 'drizzle-orm';
import { llmBudget } from '../../db';

// Runs on 1st of each month at 00:00 UTC (and is safe to run more often).
// Compute the current UTC month window start and length.
const nowMs = Date.now();
const { windowStartMs, windowMs } = getUtcMonthWindow(nowMs); // { windowStartMs, windowMs }

// `budget` is the current row loaded earlier for feature='term_suggestion'.
if (budget.windowStartMs !== windowStartMs) {
	await db
		.update(llmBudget)
		.set({
			windowStartMs,
			windowMs,
			sharedUsedCount: 0,
			reservedUsedCount: 0,
			disabledUntilMs: null,
			updatedAtMs: nowMs,
		})
		.where(eq(llmBudget.feature, 'term_suggestion'));
}
```

## Alternatives considered

### 1. Unlimited suggestions with aggressive caching only

- Pro: Better user experience
- Con: No cost ceiling; vulnerable to cache-busting attacks; doesn't scale with sign-ups

### 2. Per-user daily/weekly quotas instead of lifetime

- Pro: Users can use feature regularly
- Con: Requires quota reset logic; higher monthly cost; more complex to reason about

### 3. Single global pool (no admin reservation)

- Pro: Simpler implementation
- Con: Admin demos could fail if public users exhaust pool; no guaranteed capacity for product showcase

### 4. Token-based quotas instead of request-based

- Pro: More granular cost control
- Con: Harder to explain to users; requires token counting; implementation complexity

### 5. Paid plans for additional suggestions

- Pro: Revenue potential
- Con: Requires payment integration (explicitly out of scope for public release)

## References

- ADR 0025: Public auth and telemetry separation (complementary abuse control)
- ADR 0020: Events-first learning telemetry (dashboard-first UX reduces suggestion dependency)
- ADR 0011: Parallel suggestion generation (concurrency patterns)
