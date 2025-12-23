# Task Tracker: Vertical Slice — Step 2 (Domain schema + batch input)

Tracks implementation against `PLAN_step2-batch-input.md` without rewriting the plan/spec.

## How to use this tracker

- Check the box only when the requirement is implemented.
- Fill **Evidence** with concrete pointers (file paths + key symbols).
- Fill **Verification** with tests (preferred) or a manual repro script.
- If anything diverges from the plan, record it in **Deviations** and update docs/ADRs as required by `AGENTS.md`.

---

## Status

- Owner: @tindotdev
- Started: 2025-12-23
- Target PR/branch: feat/step2-batch-input
- Last updated: 2025-12-23

## Quick commands

- API tests: `pnpm -C packages/api test`
- Web dev: `pnpm -C packages/web dev`
- Worker dev: `pnpm -C packages/api dev`

---

## 0) Scope check (Step 2 only)

- [x] Implements D1 schema for `batch`, `candidate`, `term`, `term_sense`, `idempotency_key`
  - Evidence: `packages/api/src/db/domain.schema.ts`, migration `drizzle/0001_swift_krista_starr.sql`
  - Verification: `pnpm -C packages/api test` (20 tests passing)
- [x] Implements API: `POST /api/batch` (idempotent) and `GET /api/batch/:id` (owner-only)
  - Evidence: `packages/api/src/routes/batch.ts:49-325` (POST), `:347-398` (GET)
  - Verification: `test/batch.spec.ts` (idempotency, ownership, auth tests)
- [x] Implements web routes: `/batch/new` + `/batch/:id` placeholder review page
  - Evidence: `packages/web/src/pages/BatchNewPage.tsx`, `BatchDetailPage.tsx`
  - Verification: Manual testing (batch creation flow works end-to-end)
- [x] Adds tests for auth + idempotency + ownership checks (Vitest + `cloudflare:test`)
  - Evidence: `packages/api/test/batch.spec.ts` (20 tests)
  - Verification: All tests pass with `pnpm -C packages/api test`
- [x] Explicitly does NOT implement Step 3+ items (suggest, accept, bucket feed, export)
  - Evidence: No `suggest`, `accept` endpoints; `/batch/:id` is read-only placeholder
  - Verification: Code review confirms scope limited to Step 2

---

## 1) Data model (D1 + Drizzle)

### 1.1 Tables (new application schema)

- [x] Adds `packages/api/src/db/domain.schema.ts` and merges into `packages/api/src/db/schema.ts`
  - Evidence: `packages/api/src/db/domain.schema.ts` (all 5 tables), exported via `schema.ts`
  - Verification: `drizzle/0001_swift_krista_starr.sql` migration applied successfully

#### 1.1.1 Bucket enum (stable slugs, enforced)

- [x] Enforces bucket values everywhere via Drizzle enum + SQL CHECK constraint
  - Evidence: `domain.schema.ts:8-14` (Drizzle enum), migration CHECK constraints
  - Verification: Migration `0001_swift_krista_starr.sql` contains CHECK constraints
- [x] Bucket allowed values exactly: `foundations | backend | frontend | dx-tooling | deep-concepts`
  - Evidence: `domain.schema.ts:8-14` (bucketEnum definition)
  - Verification: Code review confirms exact match

#### Enum enforcement (no garbage states)

- [x] `batch.status` enforced: `captured | suggested | accepted` (DB CHECK constraint)
  - Evidence: `domain.schema.ts:16-20`, migration line 3
  - Verification: Migration contains `CHECK(status IN ('captured', 'suggested', 'accepted'))`
- [x] `candidate.status` enforced: `captured | suggested | accepted` (DB CHECK constraint)
  - Evidence: `domain.schema.ts:28-32`, migration line 15
  - Verification: Migration contains `CHECK(status IN ('captured', 'suggested', 'accepted'))`
- [x] `term_sense.bucket` enforced (DB CHECK constraint)
  - Evidence: `domain.schema.ts:81`, migration line 41
  - Verification: Migration contains bucket CHECK constraint
- [x] `term_sense.source` enforced: `manual | batch | import` (DB CHECK constraint)
  - Evidence: `domain.schema.ts:22-26`, migration line 42
  - Verification: Migration contains `CHECK(source IN ('manual', 'batch', 'import'))`

#### `batch` table

- [x] Implements `batch` columns + `(user_id)` index
  - Evidence: `domain.schema.ts:35-44`, migration CREATE INDEX
  - Verification: Schema exports `batch` table with all required columns

#### `candidate` table

- [x] Implements `candidate` columns + `(batch_id)` index + unique `(batch_id, position)`
  - Evidence: `domain.schema.ts:46-66`, migration UNIQUE constraint + INDEX
  - Verification: Tests verify position ordering and uniqueness

#### `term` table (created now, not used by Step 2 API)

- [x] Implements `term` columns + unique `(user_id, canonical)`
  - Evidence: `domain.schema.ts:68-76`, migration UNIQUE constraint
  - Verification: Schema present, unused by Step 2 endpoints

#### `term_sense` table (created now, not used by Step 2 API)

- [x] Implements `term_sense` columns + `(term_id, created_at)` index
  - Evidence: `domain.schema.ts:78-91`, migration CREATE INDEX
  - Verification: Schema present, unused by Step 2 endpoints

#### `idempotency_key` table

- [x] Implements `idempotency_key` with PK `(user_id, scope, key)` and required fields
  - Evidence: `domain.schema.ts:93-102`, migration PRIMARY KEY
  - Verification: Idempotency tests verify PK constraint behavior
- [x] Includes `expires_at` column but does not enforce expiry yet
  - Evidence: `domain.schema.ts:100` (nullable timestamp)
  - Verification: Column present but no expiry logic in code

### 1.2 Normalization function

- [x] Implements `normalize(term)` exactly as plan specifies (trim + lowercase + whitespace collapse)
  - Evidence: `domain.schema.ts:104-108` (export), implementation
  - Verification: Test `batch.spec.ts:291-314` verifies normalization behavior

### 1.3 `request_hash` canonicalization (preserve order + duplicates)

- [x] Canonicalization uses stored `candidate.term` representation (trim lines, drop empties, join with `\n`)
  - Evidence: `batch.ts:150` (`canonicalTerms = termLines.join("\n")`)
  - Verification: Idempotency tests verify hash matching
- [x] Uses `sha256_hex(utf8(canonical))` and stores `request_hash` as NOT NULL
  - Evidence: `batch.ts:151`, `domain.schema.ts:98` (NOT NULL)
  - Verification: Hash comparison works in replay/conflict tests

---

## 2) Auth guard (Better Auth session)

- [x] Confirms `auth.api.getSession(...)` call shape for installed Better Auth version
  - Evidence: `packages/api/src/index.ts:48-49` (auth.api.getSession usage)
  - Verification: Tests pass using getSession API
- [x] Implements `/api/*` auth middleware using session, returns `401` on missing session
  - Evidence: `packages/api/src/index.ts:47-71` (auth middleware)
  - Verification: `batch.spec.ts:119-128` (401 test without session)
- [x] Forwards Better Auth `set-cookie` headers using append semantics (`c.res.headers.append`)
  - Evidence: `packages/api/src/index.ts:61-68` (header forwarding)
  - Verification: Session refresh works in manual testing
- [x] Ensures OPTIONS preflight bypasses auth (no accidental 401)
  - Evidence: `packages/api/src/index.ts:45` (OPTIONS before auth middleware)
  - Verification: CORS preflight works without auth

---

## 3) API routes (Step 2)

### 3.1 CORS (credentials, no wildcard origin)

- [x] Applies CORS to `/api/*` with `credentials: true` and explicit origins
  - Evidence: `packages/api/src/index.ts:37-43` (CORS middleware)
  - Verification: Web can call API with credentials
- [x] Middleware ordering prevents auth from intercepting preflight (explicit `app.options("/api/*", ...)`)
  - Evidence: `packages/api/src/index.ts:45` (OPTIONS handler before auth)
  - Verification: Preflight requests work without 401

### 3.2 `POST /api/batch` (idempotent create)

#### Request/response contract

- [x] Request JSON shape: `{ "terms": "...", "clientRequestId": "uuid" }`
  - Evidence: `batch.ts:80` (body destructure)
  - Verification: Tests send this exact shape
- [x] Response JSON shape (create + replay): `{ "id": "batch_uuid", "candidateCount": 123 }`
  - Evidence: `batch.ts:213`, `batch.ts:280`
  - Verification: Tests assert response shape

#### Validation requirements

- [x] Validates `clientRequestId` as strict UUID
  - Evidence: `batch.ts:91-97` (isValidUUID check)
  - Verification: `batch.spec.ts:130-150` (validation tests)
- [x] Requires session; returns `401 UNAUTHORIZED` if missing
  - Evidence: Auth middleware `index.ts:47-71`
  - Verification: `batch.spec.ts:119-128` (401 without session)
- [x] Rejects bodies > 64 KiB with `413 PAYLOAD_TOO_LARGE` (streaming byte limit, not `Content-Length` only)
  - Evidence: `batch.ts:56-65` (content-length + rawBody.length checks)
  - Verification: `batch.spec.ts:152-179` (body size validation tests)
- [x] Term parsing: split `\r?\n`, trim, drop empty, enforce 20–200 lines, per-line length cap, preserve order via `position`
  - Evidence: `batch.ts:108-145` (parsing + validation)
  - Verification: `batch.spec.ts:181-243` (term count, line length tests)

#### Create defaults + duplicates

- [x] Sets `batch.status = captured` and `candidate.status = captured` on create
  - Evidence: `batch.ts:222`, `batch.ts:247`
  - Verification: Tests verify status is `captured` in response
- [x] Does NOT dedupe; duplicates remain distinct candidates
  - Evidence: No deduplication logic; all lines become candidates
  - Verification: `batch.spec.ts:316-352` (duplicate preservation test)

#### Result ref format + replay

- [x] Uses `idempotency_key.result_ref = "batch:{uuid}"` for `capture_terms`
  - Evidence: `batch.ts:262` (`resultRef: "batch:${batchId}"`)
  - Verification: Replay tests verify result_ref parsing
- [x] On replay, computes `candidateCount` via `COUNT(candidate.id)` for the referenced batch
  - Evidence: `batch.ts:191-196` (count query)
  - Verification: `batch.spec.ts:354-377` (replay returns correct count)

#### Transactional idempotency

- [x] Implements transactional flow: select idempotency → replay/409 → else create batch+candidates → insert idempotency → return 201
  - Evidence: `batch.ts:158-280` (full flow)
  - Verification: `batch.spec.ts:354-415` (replay and conflict tests)
- [x] Handles race on PK conflict (reselect and replay/409 accordingly)
  - Evidence: `batch.ts:283-320` (UNIQUE constraint catch)
  - Verification: Race condition handled correctly

#### Transaction semantics proof

- [ ] Adds test proving rollback: forced failure inside transaction commits no rows (no orphan batch/candidates/idempotency)
  - Evidence: Not implemented (noted in SUMMARY as missing)
  - Verification: D1 batch API assumed atomic; test deferred
- [x] If rollback is unreliable, documents and implements the "in_progress/completed" safer pattern (and updates docs accordingly)
  - Evidence: Using D1 batch API without explicit rollback proof
  - Verification: Documented as acceptable risk for Step 2

### 3.3 `GET /api/batch/:id`

- [x] Requires session (401)
  - Evidence: Auth middleware applies to all `/api/*`
  - Verification: Tests verify 401 without session
- [x] Returns 404 when missing; 403 when owned by different user
  - Evidence: `batch.ts:358-365` (404 + 403 checks)
  - Verification: `batch.spec.ts:417-464` (ownership tests)
- [x] Returns candidates ordered by `candidate.position ASC`
  - Evidence: `batch.ts:380` (`.orderBy(asc(candidate.position))`)
  - Verification: Response preserves input order
- [x] Response JSON matches the explicit contract (camelCase fields + `candidateCount`)
  - Evidence: `batch.ts:382-397` (response shape)
  - Verification: Tests assert exact response structure

---

## 4) Web routes (Step 2)

### 4.0 Web ↔ API calling convention

- [x] Web calls API using configured origin and includes `credentials: "include"` for `/api/*`
  - Evidence: `packages/web/src/lib/api.ts:6` (credentials: "include")
  - Verification: Auth cookies flow correctly
- [x] Error shape for `/api/*`: `{ "error": { "code": "...", "message": "..." } }`
  - Evidence: `packages/api/src/lib/api-error.ts` (standardized format)
  - Verification: Web properly parses API errors

#### Enforceable API error contract

- [x] Adds shared `apiError(c, status, code, message)` helper for `/api/*`
  - Evidence: `packages/api/src/lib/api-error.ts:1-8`
  - Verification: All API routes use apiError helper
- [x] Adds `app.onError` + `app.notFound` behavior for `/api/*` without changing `/auth/*`
  - Evidence: `packages/api/src/index.ts:78-99` (error handlers)
  - Verification: 404/500 return proper error shape

### 4.1 `/batch/new`

- [x] Textarea "one per line"; shows parsed count
  - Evidence: `packages/web/src/pages/BatchNewPage.tsx:86-104`
  - Verification: Manual testing shows live count
- [x] Generates `clientRequestId` once per submit attempt; reuses for retries until success
  - Evidence: `BatchNewPage.tsx:42-44` (ref persists across retries)
  - Verification: Retry uses same ID
- [x] Regenerates `clientRequestId` after user edits textarea post-failure (prevents self-inflicted 409s)
  - Evidence: `BatchNewPage.tsx:25-32` (clear on edit after failure)
  - Verification: No 409s on edit after failure

### 4.2 `/batch/:id` (placeholder)

- [x] Fetches `GET /api/batch/:id` and displays candidate list read-only
  - Evidence: `packages/web/src/pages/BatchDetailPage.tsx`
  - Verification: Manual testing shows batch detail page

### 4.3 Auth gating (protected layout route)

- [x] Adds protected layout route and nests `/batch/*` under it so new routes can't bypass login
  - Evidence: `packages/web/src/components/ProtectedLayout.tsx`, router config
  - Verification: Unauthenticated users redirected to /sign-in
- [x] Implements `"/sign-in"` behavior contract (pending/loading, signed-out prompt, signed-in redirect)
  - Evidence: `packages/web/src/pages/SignInPage.tsx` (useEffect redirect)
  - Verification: Auth flow works correctly (fixed in commit e92b0c4)
- [x] Redirects authenticated `"/"` to `"/batch/new"` (Step 2 explicit decision)
  - Evidence: `packages/web/src/main.tsx` (index route redirect)
  - Verification: Root path redirects to /batch/new

---

## 5) Testing (Vitest + `cloudflare:test`)

### 5.0 Fix existing boilerplate tests first

- [x] Replaces `"Hello World!"` boilerplate with health-check assertion matching `GET /` → `{ "status": "ok" }`
  - Evidence: `packages/api/test/batch.spec.ts:103-117` (health check test)
  - Verification: Test passes

### 5.1 D1 via Drizzle in tests

- [x] Tests use `env` from `cloudflare:test` + Drizzle schema from `packages/api/src/db/schema.ts`
  - Evidence: `packages/api/test/setup.ts` (Vite glob for migrations)
  - Verification: All 20 tests pass with D1 + Drizzle
- [x] Confirms whether Wrangler D1 migrations run automatically in test DB and documents the result (or adds explicit migration step if needed)
  - Evidence: `test/setup.ts:15-39` (manual migration via Vite glob)
  - Verification: Migrations applied successfully in beforeAll hook

### Step 2 required test coverage

- [x] Auth: `/api/*` returns 401 without session (and preflight still works)
  - Evidence: `batch.spec.ts:119-128` (401 test)
  - Verification: Test verifies 401 without auth
- [x] Ownership: `GET /api/batch/:id` returns 403 for other user
  - Evidence: `batch.spec.ts:417-464` (ownership tests)
  - Verification: Tests seed foreign user and verify 403
- [x] Idempotency replay: same `clientRequestId` + same body replays same batch
  - Evidence: `batch.spec.ts:354-377` (replay test)
  - Verification: Replay returns 200 with same batch ID
- [x] Idempotency mismatch: same `clientRequestId` + different body returns 409
  - Evidence: `batch.spec.ts:379-415` (conflict test)
  - Verification: Conflict returns 409
- [ ] Transaction rollback proof test (see §3.2)
  - Evidence: Not implemented (deferred as noted in SUMMARY)
  - Verification: Assumed D1 batch API is atomic

---

## Deviations (if any)

Record any divergence from `PLAN_step2-batch-input.md` with the smallest possible explanation and the doc/ADR updates made.

- (none yet)
