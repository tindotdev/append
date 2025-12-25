# Plan: Fifth Vertical Slice — Accept-all Materializes Rows

**Date**: 2025-12-25
**Task**: Implement Step 5 from `docs/vertical-slice.md`: an owner-only `POST /api/batch/:id/accept` endpoint that materializes each batch candidate into canonical `term` + append-only `term_sense` rows and marks candidates as materialized in a retry-safe way. Ensure idempotent replay for the same `clientRequestId`, and safe re-runs (with different `clientRequestId`) by skipping already-materialized candidates.
**Source Prompt**: Session pickup with clarification decisions (2025-12-25)

## Inputs Reviewed

- `docs/vertical-slice.md`
- `docs/build-plan.md`
- `docs/design.md`
- `docs/adr/0008-accept-all-idempotency-via-candidate-materialization-pointers.md`
- `packages/api/src/routes/batch.ts`
- `packages/api/src/db/domain.schema.ts`
- `packages/api/src/lib/api-error.ts`
- `packages/api/src/lib/crypto.ts`
- `packages/api/drizzle/0002_busy_vulcan.sql`
- `packages/api/test/batch.spec.ts`

## Goal / Success Criteria

- `POST /api/batch/:id/accept` returns `200` with the exact response contract from `docs/vertical-slice.md` and sets `batch.status = 'accepted'`.
- For every candidate in `position ASC` order:
  - If not yet materialized, the endpoint creates/attaches canonical storage:
    - Upserts `term` by `(user_id, canonical)` without modifying existing `display_term` or `primary_sense_id`.
    - Inserts one new `term_sense` row with `source='batch'` and the effective bucket/text.
    - Updates the candidate to `status='accepted'` and writes `materialized_term_id` + `materialized_term_sense_id` (without modifying `candidate.version`).
  - If already materialized (`candidate.materialized_term_sense_id` is set), the endpoint skips it and creates no additional rows.
- Idempotency:
  - Re-running accept-all with the same `clientRequestId` is a replay and returns the same summary (no duplicates).
  - Re-running accept-all with a different `clientRequestId` is safe because already-materialized candidates are skipped (no duplicates).
- Precondition enforcement:
  - If any candidate has `suggestionStatus='in_progress'`, return `409 BATCH_NOT_READY` with the specified `details`.
  - If any candidate is missing either effective field (`chosen* ?? suggested*`), return `409 BATCH_NOT_READY` with the specified `details`.
- Tests validate auth/ownership, both `BATCH_NOT_READY` cases, idempotent replay, and “no duplicates on retry” behavior.

## Constraints

- Cloudflare-first architecture: SPA + Hono Worker + D1 (no SSR). (`docs/design.md`, ADR 0004)
- Duplicates policy: canonical `term` plus append-only `term_sense` (duplicates allowed-but-flagged). (`docs/design.md`, ADR 0002)
- Accept-all idempotency: enforced via per-candidate materialization pointers. (`docs/vertical-slice.md`, ADR 0008)
- Normalization is fixed and must match Step 2: `normalize(term) = trim → lowercase → collapse internal whitespace to a single space`. (`docs/vertical-slice.md`, `docs/design.md`)
- Effective fields are computed exactly as:
  - `effectiveBucket = chosenBucket ?? suggestedBucket`
  - `effectiveText = chosenText ?? suggestedText` (`docs/vertical-slice.md`)
- Text rules for materialized sense text are fixed: trimmed, single-line (no `\n`), max 500 chars. (`docs/vertical-slice.md`)
- Accept-all must not modify `candidate.version`. (`docs/vertical-slice.md`)

## Non-goals (explicitly out of scope)

- Per-item accept (single-candidate accept). (`docs/vertical-slice.md` says accept-all only in this slice)
- Bucket feed, export, and import work.
- Any new UI affordances beyond existing batch review + per-row "Save/Clear overrides".
- Any schema changes beyond what already exists for Step 5 (no new tables/columns for accept-all).

## DB Dependencies (existing schema relied upon)

**No migration required for this slice.** All required tables, columns, and constraints already exist in `packages/api/src/db/domain.schema.ts` (applied via existing migrations).

| Table             | Column/Constraint                                                   | Purpose in this slice                                |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `term`            | `id` (PK)                                                           | Term identity                                        |
| `term`            | `user_id` (NOT NULL, FK to user)                                    | Owner enforcement                                    |
| `term`            | `canonical` (NOT NULL)                                              | Deduplication key                                    |
| `term`            | `display_term` (NOT NULL)                                           | First-seen display form                              |
| `term`            | `primary_sense_id` (nullable)                                       | First sense pointer                                  |
| `term`            | `term_user_canonical_unique` (UNIQUE INDEX on `user_id, canonical`) | Prevents duplicate terms per user                    |
| `term_sense`      | `id` (PK)                                                           | Sense identity                                       |
| `term_sense`      | `term_id` (NOT NULL, FK to term)                                    | Links sense to term                                  |
| `term_sense`      | `bucket` (NOT NULL, CHECK constraint)                               | Bucket validation                                    |
| `term_sense`      | `text` (NOT NULL)                                                   | Definition text                                      |
| `term_sense`      | `source` (NOT NULL, CHECK constraint)                               | Tracks origin (`batch`)                              |
| `term_sense`      | `flagged_reason` (nullable)                                         | Bucket conflict flag                                 |
| `candidate`       | `materialized_term_id` (nullable)                                   | Pointer to created term                              |
| `candidate`       | `materialized_term_sense_id` (nullable)                             | Pointer to created term_sense (ADR 0008 idempotency) |
| `candidate`       | `status` (NOT NULL)                                                 | Lifecycle state (`accepted`)                         |
| `idempotency_key` | PK on `(user_id, scope, key)`                                       | Replay/conflict detection                            |
| `idempotency_key` | `request_hash` (NOT NULL)                                           | Payload fingerprint                                  |
| `idempotency_key` | `result_ref` (NOT NULL)                                             | Cached response                                      |

**Relied-upon behaviors**:

- `INSERT OR IGNORE` on `term` relies on the `term_user_canonical_unique` index to silently skip duplicates.
- `INSERT OR IGNORE` on `term_sense` relies on the `id` PK to silently skip duplicates (deterministic IDs).
- FK constraint on `term_sense.term_id` ensures referential integrity (term must exist before sense).

## Locked Decisions (no open questions)

- **Endpoint**: `POST /api/batch/:id/accept` (`docs/vertical-slice.md`)
- **AuthZ**: authenticated; owner-only (`403` if not owner; `404` if batch missing). (`docs/vertical-slice.md`)
- **Preconditions**: `BATCH_NOT_READY` behavior and `details` payloads are exactly as specified. (`docs/vertical-slice.md`)
- **Materialization idempotency mechanism**: skip candidates where `candidate.materialized_term_sense_id` is already set (ADR 0008).
- **Upsert rule**: `term` is upserted by `(user_id, canonical)`; on conflict do not change `display_term` or `primary_sense_id`. (`docs/vertical-slice.md`)
- **Primary sense initialization**: when a term is newly created, set `term.primary_sense_id` to the new `term_sense.id` created for the first materialization. (`docs/vertical-slice.md`)
- **Flagging rule**: set `term_sense.flagged_reason = 'bucket_conflict'` iff term has `primary_sense_id` and that primary sense’s bucket differs from `effectiveBucket`; otherwise null. (`docs/vertical-slice.md`)
- **Accept-all idempotency key decisions (explicit)**:
  - `idempotency_key.scope = "accept_all"`
  - `request_hash = sha256_hex(utf8("batch:" + batchId))`
  - `result_ref = "accept_summary:" + base64url(utf8(JSON.stringify(<AcceptSummary>)))` (base64url, no padding)
- **Replay semantics**: same `clientRequestId` returns the stored summary; a different `clientRequestId` is safe because materialized candidates are skipped. (`docs/vertical-slice.md`, ADR 0008)

## Specification / Contracts (fully specified)

### 1) `POST /api/batch/:id/accept`

- **Path params**
  - `:id` (`batchId`): string
- **Auth**
  - Session required (global `/api/*` middleware)
  - Owner-only:
    - `404 NOT_FOUND` if batch does not exist
    - `403 FORBIDDEN` if batch exists but is not owned by the authenticated user
- **Request body JSON**
  - `{ "clientRequestId": string }`
  - `clientRequestId` validation:
    - must be present
    - must be a UUID v4 (case-insensitive): `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
- **Preconditions (fail fast)**
  - Load all candidates for the batch ordered by `position ASC`.
  - If any candidate has `suggestionStatus = "in_progress"`:
    - return `409 BATCH_NOT_READY` with:
      - `error.code = "BATCH_NOT_READY"`
      - `details = { "reason": "SUGGESTIONS_IN_PROGRESS", "inProgressCandidateIds": string[] }`
  - Compute effective fields for every candidate:
    - `effectiveBucket = chosenBucket ?? suggestedBucket`
    - `effectiveText = chosenText ?? suggestedText`
  - If any candidate is missing `effectiveBucket` or missing `effectiveText`:
    - return `409 BATCH_NOT_READY` with:
      - `error.code = "BATCH_NOT_READY"`
      - `details = { "reason": "MISSING_EFFECTIVE_FIELDS", "missingCandidateIds": string[] }`
- **Materialization algorithm (storage effects)**
  - **Phase 1: Build canonical → termId mapping** (before any writes)
    1. Pre-fetch all existing terms for this user where `canonical IN (list of all candidate canonicals)`.
    2. Build a `Map<canonical, termId>` from the pre-fetched terms.
    3. For each unmaterialized candidate in `position ASC` order:
       - Compute `canonical = normalize(candidate.term)`.
       - If `canonical` is NOT in the map:
         - Assign `termId = "term:" + candidateId` (deterministic ID from first candidate for this canonical).
         - Add `canonical → termId` to the map.
         - Mark this candidate as the "term creator" for this canonical.
       - Otherwise: use the existing `termId` from the map.
    - This ensures: (a) only one term INSERT per canonical, (b) all candidates with the same canonical share the same termId, (c) the "winner" is deterministic (lowest position).

  - **Phase 2: Generate statements** (for each unmaterialized candidate in `position ASC` order)
    - If `candidate.materialized_term_sense_id` is non-null: skip (already materialized).
    - Otherwise:
      1. Lookup `termId` from the canonical → termId map built in Phase 1.
      2. Determine if this candidate is the "term creator" for its canonical:
         - If yes: generate `INSERT OR IGNORE INTO term ...` statement.
         - If no: do not generate a term INSERT (the term either exists or will be created by an earlier candidate).
      3. Generate `INSERT OR IGNORE INTO term_sense ...` statement with:
         - `id = "term_sense:" + candidateId`
         - `term_id = termId` (from the map)
         - `bucket = effectiveBucket`
         - `text = effectiveText` (trimmed, single-line, ≤ 500 chars)
         - `source = "batch"`
         - `flagged_reason`:
           - `"bucket_conflict"` if the term has an existing `primary_sense_id` (from pre-fetch) and that primary sense's bucket differs from `effectiveBucket`
           - otherwise `null`
      4. Generate `UPDATE candidate ...` statement to set materialization pointers (no version bump):
         - `candidate.status = "accepted"`
         - `candidate.materialized_term_id = termId`
         - `candidate.materialized_term_sense_id = "term_sense:" + candidateId`

  - **Phase 3: Execute**
    - Append batch UPDATE and idempotency_key INSERT statements.
    - Execute all statements in a single `db.batch()` call (all-or-nothing).

  - **Phase 4: Update batch status**
    - `batch.status = "accepted"` (included in the batch above)

- **Idempotency behavior**
  - Define idempotency key identity as `(user_id, scope="accept_all", key=clientRequestId)`.
  - `request_hash` is computed as `sha256_hex(utf8("batch:" + batchId))`.
  - Replay/conflict rules:
    - If an existing idempotency key exists and `request_hash` matches: return the stored summary (replay).
    - If an existing idempotency key exists and `request_hash` differs: return `409 IDEMPOTENCY_CONFLICT`.
  - Summary persistence:
    - On first successful completion, write `idempotency_key.result_ref` as:
      - `accept_summary:<base64url(JSON)>`
    - Base64url encoding rules (exact):
      - bytes = UTF-8 encoding of the JSON string
      - base64 = standard base64 encoding of bytes
      - base64url = replace `+` → `-`, `/` → `_`, and remove all trailing `=` padding
- **Success response `200` JSON**
  - `batchId`: string
  - `status`: `"accepted"`
  - `candidateCount`: number (total candidates in the batch)
  - `acceptedCount`: number (candidates materialized by this request; equals `termSenseCreatedCount`)
  - `skippedAlreadyAcceptedCount`: number (candidates skipped because already materialized)
  - `termCreatedCount`: number (new `term` rows created by this request)
  - `termSenseCreatedCount`: number (new `term_sense` rows created by this request)
  - `flaggedCount`: number (new `term_sense` rows created by this request with `flagged_reason='bucket_conflict'`)
- **Error responses**
  - `400 VALIDATION_ERROR` (invalid body / missing `clientRequestId` / invalid UUID v4)
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`
  - `404 NOT_FOUND`
  - `409 BATCH_NOT_READY` (as specified above)
  - `409 IDEMPOTENCY_CONFLICT`:
    - Condition: same `clientRequestId` was previously used for a different batch
    - Response body:
      - `error.code = "IDEMPOTENCY_CONFLICT"`
      - `error.message = "clientRequestId was used for a different batch"`
      - `details = { "originalBatchId": string }`
    - How `originalBatchId` is derived:
      1. Decode the existing `idempotency_key.result_ref` (format: `accept_summary:<base64url(json)>`).
      2. Parse the JSON and extract `batchId` from the summary.
      3. If decoding fails (corrupted data): return `500 INTERNAL_ERROR` with message `"Invalid idempotency result reference"`.
  - `500 INTERNAL_ERROR` (unexpected server error; partial progress is permitted and safe to retry due to ADR 0008 pointers)

## Implementation Plan

### Step 1: Add accept-all route handler

**File**: `packages/api/src/routes/batch.ts`

Add `POST /:id/accept` handler after the existing `POST /:id/suggest`:

1. Parse and validate `clientRequestId` from request body.
2. Lookup batch; verify ownership (404/403).
3. Check idempotency key for replay/conflict (scope=`accept_all`, key=`clientRequestId`).
4. Load all candidates for the batch ordered by `position ASC`.
5. Check preconditions (in-progress suggestions, missing effective fields).
6. Pre-fetch existing terms by `(user_id, canonical)` to determine which terms exist.
7. Build D1 batch statements (see crash-safe mechanism below).
8. Execute batch atomically via `c.env.DB.batch(statements)`.
9. Return summary response.

### Step 2: Crash-safe mechanism (D1 batch + deterministic IDs)

**Atomicity**: All storage writes (term INSERTs, term_sense INSERTs, candidate UPDATEs, batch UPDATE, idempotency_key INSERT) are executed in a **single D1 batch** which is all-or-nothing.

**Deterministic IDs**: To defend against partial commits (theoretically impossible with D1 batch, but defense-in-depth):

- `term.id = "term:" + candidateId` (for new terms)
- `term_sense.id = "term_sense:" + candidateId`

**INSERT OR IGNORE**: All term and term_sense INSERTs use `INSERT OR IGNORE` semantics so that retries after partial success cannot create duplicates.

**Statement generation** (per unmaterialized candidate):

```sql
-- For new terms only:
INSERT OR IGNORE INTO term (id, user_id, canonical, display_term, primary_sense_id, created_at)
VALUES ('term:{candidateId}', :userId, :canonical, :displayTerm, 'term_sense:{candidateId}', :now)

-- For all unmaterialized candidates:
INSERT OR IGNORE INTO term_sense (id, term_id, bucket, text, source, flagged_reason, created_at)
VALUES ('term_sense:{candidateId}', :termId, :effectiveBucket, :effectiveText, 'batch', :flaggedReason, :now)

-- Update candidate pointers:
UPDATE candidate
SET materialized_term_id = :termId,
    materialized_term_sense_id = 'term_sense:{candidateId}',
    status = 'accepted',
    updated_at = :now
WHERE id = :candidateId

-- Batch status (single statement at end):
UPDATE batch SET status = 'accepted', updated_at = :now WHERE id = :batchId

-- Idempotency key (single statement at end):
INSERT INTO idempotency_key (user_id, scope, key, request_hash, result_ref, created_at)
VALUES (:userId, 'accept_all', :clientRequestId, :requestHash, :resultRef, :now)
```

### Step 3: Implement idempotency key handling

1. Compute `requestHash = sha256Hex("batch:" + batchId)`.
2. Lookup existing key for `(userId, scope="accept_all", key=clientRequestId)`.
3. If found and `requestHash` matches: decode `result_ref`, return cached `200` response.
4. If found and `requestHash` differs: return `409 IDEMPOTENCY_CONFLICT` with `details.originalBatchId`.
5. If not found: proceed with materialization.
6. On success: store `result_ref = "accept_summary:" + base64url(JSON.stringify(summary))`.

### Step 4: Add API integration tests

**File**: `packages/api/test/batch.spec.ts` (extend existing file)

Add new `describe("POST /api/batch/:id/accept", ...)` block with tests:

| Test Case                                                   | Expected                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| Unauthenticated                                             | 401 UNAUTHORIZED                                               |
| Missing batch                                               | 404 NOT_FOUND                                                  |
| Non-owner batch                                             | 403 FORBIDDEN                                                  |
| Missing clientRequestId                                     | 400 VALIDATION_ERROR                                           |
| Invalid clientRequestId (not UUID)                          | 400 VALIDATION_ERROR                                           |
| Suggestions in progress                                     | 409 BATCH_NOT_READY with `SUGGESTIONS_IN_PROGRESS`             |
| Missing effective fields                                    | 409 BATCH_NOT_READY with `MISSING_EFFECTIVE_FIELDS`            |
| Success: creates terms and term_senses                      | 200 with correct counts                                        |
| Replay: same clientRequestId returns cached summary         | 200 with identical response                                    |
| Idempotency conflict: same clientRequestId, different batch | 409 IDEMPOTENCY_CONFLICT                                       |
| Retry with different clientRequestId skips materialized     | 200 with `skippedAlreadyAcceptedCount > 0`                     |
| Flagged count: bucket conflict sets flaggedReason           | 200 with `flaggedCount > 0`                                    |
| Term deduplication: same canonical reuses existing term     | Verify termCreatedCount < candidateCount when duplicates exist |

### Step 5: Update docs/vertical-slice.md

**File**: `docs/vertical-slice.md`

1. Add `409 IDEMPOTENCY_CONFLICT` to Step 5 error responses with details:
   - `error.code = 'IDEMPOTENCY_CONFLICT'`
   - `details = { "originalBatchId": string }`
2. Flip Step 5 checkbox from `[ ]` to `[x]`.

## Validation

```bash
# API tests (includes new accept-all tests)
pnpm --filter append-api test

# Typecheck both packages
pnpm typecheck

# Web build (ensures no type breaks)
pnpm --filter append-web build
```

## Risks & Rollback

### Risks

| Risk                                                                                                             | Likelihood | Mitigation                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| Concurrent accept-all requests with different `clientRequestId` race before materialization pointers are written | Low        | D1 batch atomicity + deterministic IDs + `INSERT OR IGNORE` prevent duplicates even if race occurs |
| D1 batch limit exceeded for large batches                                                                        | Very Low   | 200 candidates = ~600 statements; D1 limit is 1000 statements per batch                            |
| D1 batch partial commit (theoretically impossible)                                                               | Negligible | Defense-in-depth: deterministic IDs + `INSERT OR IGNORE` + materialization pointers                |

### Rollback Commands

**Local rollback** (exact files modified by this plan):

```bash
# Restore batch route
git checkout HEAD -- packages/api/src/routes/batch.ts

# Restore test file
git checkout HEAD -- packages/api/test/batch.spec.ts

# Restore docs
git checkout HEAD -- docs/vertical-slice.md
```

**Verify rollback succeeded**:

```bash
pnpm --filter append-api test
pnpm typecheck
pnpm --filter append-web build
```

**Production rollback** (if already deployed):

```bash
# Redeploy previous version from main branch
git checkout main
pnpm --filter append-api run deploy
```

Or if using CI: revert the merge commit and let CI redeploy.

## Sign-off

- Approved: **yes**
- Approved date: 2025-12-25
- Reviewer: codex (self-review after addressing feedback)
- Notes: All 5 required edits from `SUMMARY_plan-signoff-fifth-vertical-slice-accept-all-materializes-rows.md` have been addressed:
  1. `409 IDEMPOTENCY_CONFLICT` response JSON fully specified (lines 200-209)
  2. `details.originalBatchId` derivation explicitly documented (decode result_ref → parse JSON → extract batchId)
  3. Same-run canonical duplicates handled via Phase 1 canonical→termId mapping (first by position wins)
  4. DB Dependencies section added with full table of relied-upon constraints/columns
  5. Production rollback command corrected to `pnpm --filter append-api run deploy`
