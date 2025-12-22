# Task Tracker: Vertical Slice — Step 2 (Domain schema + batch input)

Tracks implementation against `PLAN_step2-batch-input.md` without rewriting the plan/spec.

## How to use this tracker

- Check the box only when the requirement is implemented.
- Fill **Evidence** with concrete pointers (file paths + key symbols).
- Fill **Verification** with tests (preferred) or a manual repro script.
- If anything diverges from the plan, record it in **Deviations** and update docs/ADRs as required by `AGENTS.md`.

---

## Status

- Owner:
- Started:
- Target PR/branch:
- Last updated:

## Quick commands

- API tests: `pnpm -C packages/api test`
- Web dev: `pnpm -C packages/web dev`
- Worker dev: `pnpm -C packages/api dev`

---

## 0) Scope check (Step 2 only)

- [ ] Implements D1 schema for `batch`, `candidate`, `term`, `term_sense`, `idempotency_key`
  - Evidence:
  - Verification:
- [ ] Implements API: `POST /api/batch` (idempotent) and `GET /api/batch/:id` (owner-only)
  - Evidence:
  - Verification:
- [ ] Implements web routes: `/batch/new` + `/batch/:id` placeholder review page
  - Evidence:
  - Verification:
- [ ] Adds tests for auth + idempotency + ownership checks (Vitest + `cloudflare:test`)
  - Evidence:
  - Verification:
- [ ] Explicitly does NOT implement Step 3+ items (suggest, accept, bucket feed, export)
  - Evidence:
  - Verification:

---

## 1) Data model (D1 + Drizzle)

### 1.1 Tables (new application schema)

- [ ] Adds `packages/api/src/db/domain.schema.ts` and merges into `packages/api/src/db/schema.ts`
  - Evidence:
  - Verification:

#### 1.1.1 Bucket enum (stable slugs, enforced)

- [ ] Enforces bucket values everywhere via Drizzle enum + SQL CHECK constraint
  - Evidence:
  - Verification:
- [ ] Bucket allowed values exactly: `foundations | backend | frontend | dx-tooling | deep-concepts`
  - Evidence:
  - Verification:

#### Enum enforcement (no garbage states)

- [ ] `batch.status` enforced: `captured | suggested | accepted` (DB CHECK constraint)
  - Evidence:
  - Verification:
- [ ] `candidate.status` enforced: `captured | suggested | accepted` (DB CHECK constraint)
  - Evidence:
  - Verification:
- [ ] `term_sense.bucket` enforced (DB CHECK constraint)
  - Evidence:
  - Verification:
- [ ] `term_sense.source` enforced: `manual | batch | import` (DB CHECK constraint)
  - Evidence:
  - Verification:

#### `batch` table

- [ ] Implements `batch` columns + `(user_id)` index
  - Evidence:
  - Verification:

#### `candidate` table

- [ ] Implements `candidate` columns + `(batch_id)` index + unique `(batch_id, position)`
  - Evidence:
  - Verification:

#### `term` table (created now, not used by Step 2 API)

- [ ] Implements `term` columns + unique `(user_id, canonical)`
  - Evidence:
  - Verification:

#### `term_sense` table (created now, not used by Step 2 API)

- [ ] Implements `term_sense` columns + `(term_id, created_at)` index
  - Evidence:
  - Verification:

#### `idempotency_key` table

- [ ] Implements `idempotency_key` with PK `(user_id, scope, key)` and required fields
  - Evidence:
  - Verification:
- [ ] Includes `expires_at` column but does not enforce expiry yet
  - Evidence:
  - Verification:

### 1.2 Normalization function

- [ ] Implements `normalize(term)` exactly as plan specifies (trim + lowercase + whitespace collapse)
  - Evidence:
  - Verification:

### 1.3 `request_hash` canonicalization (preserve order + duplicates)

- [ ] Canonicalization uses stored `candidate.term` representation (trim lines, drop empties, join with `\n`)
  - Evidence:
  - Verification:
- [ ] Uses `sha256_hex(utf8(canonical))` and stores `request_hash` as NOT NULL
  - Evidence:
  - Verification:

---

## 2) Auth guard (Better Auth session)

- [ ] Confirms `auth.api.getSession(...)` call shape for installed Better Auth version
  - Evidence:
  - Verification:
- [ ] Implements `/api/*` auth middleware using session, returns `401` on missing session
  - Evidence:
  - Verification:
- [ ] Forwards Better Auth `set-cookie` headers using append semantics (`c.res.headers.append`)
  - Evidence:
  - Verification:
- [ ] Ensures OPTIONS preflight bypasses auth (no accidental 401)
  - Evidence:
  - Verification:

---

## 3) API routes (Step 2)

### 3.1 CORS (credentials, no wildcard origin)

- [ ] Applies CORS to `/api/*` with `credentials: true` and explicit origins
  - Evidence:
  - Verification:
- [ ] Middleware ordering prevents auth from intercepting preflight (explicit `app.options("/api/*", ...)`)
  - Evidence:
  - Verification:

### 3.2 `POST /api/batch` (idempotent create)

#### Request/response contract

- [ ] Request JSON shape: `{ "terms": "...", "clientRequestId": "uuid" }`
  - Evidence:
  - Verification:
- [ ] Response JSON shape (create + replay): `{ "id": "batch_uuid", "candidateCount": 123 }`
  - Evidence:
  - Verification:

#### Validation requirements

- [ ] Validates `clientRequestId` as strict UUID
  - Evidence:
  - Verification:
- [ ] Requires session; returns `401 UNAUTHORIZED` if missing
  - Evidence:
  - Verification:
- [ ] Rejects bodies > 64 KiB with `413 PAYLOAD_TOO_LARGE` (streaming byte limit, not `Content-Length` only)
  - Evidence:
  - Verification:
- [ ] Term parsing: split `\r?\n`, trim, drop empty, enforce 20–200 lines, per-line length cap, preserve order via `position`
  - Evidence:
  - Verification:

#### Create defaults + duplicates

- [ ] Sets `batch.status = captured` and `candidate.status = captured` on create
  - Evidence:
  - Verification:
- [ ] Does NOT dedupe; duplicates remain distinct candidates
  - Evidence:
  - Verification:

#### Result ref format + replay

- [ ] Uses `idempotency_key.result_ref = "batch:{uuid}"` for `capture_terms`
  - Evidence:
  - Verification:
- [ ] On replay, computes `candidateCount` via `COUNT(candidate.id)` for the referenced batch
  - Evidence:
  - Verification:

#### Transactional idempotency

- [ ] Implements transactional flow: select idempotency → replay/409 → else create batch+candidates → insert idempotency → return 201
  - Evidence:
  - Verification:
- [ ] Handles race on PK conflict (reselect and replay/409 accordingly)
  - Evidence:
  - Verification:

#### Transaction semantics proof

- [ ] Adds test proving rollback: forced failure inside transaction commits no rows (no orphan batch/candidates/idempotency)
  - Evidence:
  - Verification:
- [ ] If rollback is unreliable, documents and implements the “in_progress/completed” safer pattern (and updates docs accordingly)
  - Evidence:
  - Verification:

### 3.3 `GET /api/batch/:id`

- [ ] Requires session (401)
  - Evidence:
  - Verification:
- [ ] Returns 404 when missing; 403 when owned by different user
  - Evidence:
  - Verification:
- [ ] Returns candidates ordered by `candidate.position ASC`
  - Evidence:
  - Verification:
- [ ] Response JSON matches the explicit contract (camelCase fields + `candidateCount`)
  - Evidence:
  - Verification:

---

## 4) Web routes (Step 2)

### 4.0 Web ↔ API calling convention

- [ ] Web calls API using configured origin and includes `credentials: "include"` for `/api/*`
  - Evidence:
  - Verification:
- [ ] Error shape for `/api/*`: `{ "error": { "code": "...", "message": "..." } }`
  - Evidence:
  - Verification:

#### Enforceable API error contract

- [ ] Adds shared `apiError(c, status, code, message)` helper for `/api/*`
  - Evidence:
  - Verification:
- [ ] Adds `app.onError` + `app.notFound` behavior for `/api/*` without changing `/auth/*`
  - Evidence:
  - Verification:

### 4.1 `/batch/new`

- [ ] Textarea “one per line”; shows parsed count
  - Evidence:
  - Verification:
- [ ] Generates `clientRequestId` once per submit attempt; reuses for retries until success
  - Evidence:
  - Verification:
- [ ] Regenerates `clientRequestId` after user edits textarea post-failure (prevents self-inflicted 409s)
  - Evidence:
  - Verification:

### 4.2 `/batch/:id` (placeholder)

- [ ] Fetches `GET /api/batch/:id` and displays candidate list read-only
  - Evidence:
  - Verification:

### 4.3 Auth gating (protected layout route)

- [ ] Adds protected layout route and nests `/batch/*` under it so new routes can’t bypass login
  - Evidence:
  - Verification:
- [ ] Implements `"/sign-in"` behavior contract (pending/loading, signed-out prompt, signed-in redirect)
  - Evidence:
  - Verification:
- [ ] Redirects authenticated `"/"` to `"/batch/new"` (Step 2 explicit decision)
  - Evidence:
  - Verification:

---

## 5) Testing (Vitest + `cloudflare:test`)

### 5.0 Fix existing boilerplate tests first

- [ ] Replaces `"Hello World!"` boilerplate with health-check assertion matching `GET /` → `{ "status": "ok" }`
  - Evidence:
  - Verification:

### 5.1 D1 via Drizzle in tests

- [ ] Tests use `env` from `cloudflare:test` + Drizzle schema from `packages/api/src/db/schema.ts`
  - Evidence:
  - Verification:
- [ ] Confirms whether Wrangler D1 migrations run automatically in test DB and documents the result (or adds explicit migration step if needed)
  - Evidence:
  - Verification:

### Step 2 required test coverage

- [ ] Auth: `/api/*` returns 401 without session (and preflight still works)
  - Evidence:
  - Verification:
- [ ] Ownership: `GET /api/batch/:id` returns 403 for other user
  - Evidence:
  - Verification:
- [ ] Idempotency replay: same `clientRequestId` + same body replays same batch
  - Evidence:
  - Verification:
- [ ] Idempotency mismatch: same `clientRequestId` + different body returns 409
  - Evidence:
  - Verification:
- [ ] Transaction rollback proof test (see §3.2)
  - Evidence:
  - Verification:

---

## Deviations (if any)

Record any divergence from `PLAN_step2-batch-input.md` with the smallest possible explanation and the doc/ADR updates made.

- (none yet)
