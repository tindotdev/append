# Plan: Vertical Slice — Step 2 (Domain schema + batch input)

**Status**: ✅ Complete (merged 2025-12-23, commit `82bc919`)

Primary goal: continue the current `docs/vertical-slice.md` focus ("Step 2: Domain schema + batch input") with an implementation plan that is unambiguous and aligned with `docs/design.md`.

---

## Completion Summary

All scope items implemented and tested:

- [x] D1 schema: `batch`, `candidate`, `term`, `term_sense`, `idempotency_key`
- [x] API: `POST /api/batch` (idempotent), `GET /api/batch/:id` (owner-only)
- [x] Web: `/batch/new`, `/batch/:id`, protected layout route
- [x] Tests: 20 passing (auth, idempotency, ownership, validation)
- [x] Production deployed and validated

See `docs/vertical-slice.md` for current state.

---

## Scope (Step 2 only)

- D1 schema for: `batch`, `candidate`, `term`, `term_sense`, `idempotency_key`
- API routes:
  - `POST /api/batch` (creates batch + candidates; idempotent)
  - `GET /api/batch/:id` (owner-only read)
- Web routes:
  - `/batch/new` (textarea → submit)
  - `/batch/:id` (placeholder review page)
- Tests (Vitest + `cloudflare:test`) for auth + idempotency + ownership checks

Non-goals in Step 2:

- suggestions (`/api/batch/:id/suggest`)
- accept/accept-all (`/api/batch/:id/accept`)
- bucket feed, export

---

## 1) Data model (D1 + Drizzle)

### 1.1 Tables (new application schema)

Implement these tables in `packages/api/src/db/domain.schema.ts` and merge into `packages/api/src/db/schema.ts`.

### 1.1.1 Bucket enum (no guessing)

Buckets are stored as **stable slugs** (exact strings) and are used consistently across DB + API + UI.

- Allowed values: `foundations | backend | frontend | dx-tooling | deep-concepts`
- Any column that represents a bucket must use this same enum:
  - `term_sense.bucket`
  - (future) `candidate.chosen_bucket`
  - (future) `suggestion.suggested_bucket`

Schema enforcement:

- In Drizzle, model bucket columns as a text enum with the allowed values.
- In the SQL migration, add a CHECK constraint so invalid values can’t be inserted.

**Enum enforcement is not optional (no garbage states):**

- Any enum-like column we introduce in Step 2 must be enforced at the DB layer with a CHECK constraint (via Drizzle enum + generated SQL):
  - `batch.status`
  - `candidate.status`
  - `term_sense.bucket`
  - `term_sense.source`

**`batch`**

- `id` (text, PK, uuid)
- `user_id` (text, FK → `user.id`, cascade delete)
- `status` (text: `captured | suggested | accepted`)
- `created_at` (timestamp_ms)
- `updated_at` (timestamp_ms)
- index: `(user_id)`

**`candidate`**

- `id` (text, PK, uuid)
- `batch_id` (text, FK → `batch.id`, cascade delete)
- `position` (integer, NOT NULL) — 0-based index preserving the post-trim input order
- `term` (text; trimmed input line — leading/trailing whitespace not preserved)
- `normalized_term` (text; `normalize(term)`)
- `status` (text: `captured | suggested | accepted`)
- `chosen_bucket` (text, nullable) — Step 4+
- `chosen_text` (text, nullable) — Step 4+
- `version` (integer, default 1) — optimistic locking (Step 4+)
- `created_at` (timestamp_ms)
- `updated_at` (timestamp_ms)
- index: `(batch_id)`
- unique: `(batch_id, position)` (prevents reordering ambiguity)

**`term`** (not used by Step 2 API yet, but created now to avoid schema churn in Step 3/4)

- `id` (text, PK, uuid)
- `user_id` (text, FK → `user.id`, cascade delete)
- `canonical` (text; `normalize(display_term)`)
- `display_term` (text)
- `primary_sense_id` (text, nullable) — keep nullable/no-FK for now
- `created_at` (timestamp_ms)
- `archived_at` (timestamp_ms, nullable)
- unique: `(user_id, canonical)`

**`term_sense`** (not used by Step 2 API yet)

- `id` (text, PK, uuid)
- `term_id` (text, FK → `term.id`, cascade delete)
- `bucket` (text enum; allowed values listed in “Bucket enum” above)
- `text` (text)
- `source` (text: `manual | batch | import`)
- `sense_label` (text, nullable)
- `flagged_reason` (text, nullable)
- `created_at` (timestamp_ms)
- `archived_at` (timestamp_ms, nullable)
- index: `(term_id, created_at)` (matches `docs/design.md` indexing guidance)

**`idempotency_key`** (keyed exactly as `docs/design.md` describes)

- `user_id` (text, FK → `user.id`, cascade delete)
- `scope` (text) — e.g. `capture_terms`
- `key` (text) — the client-provided `clientRequestId`
- `request_hash` (text, **NOT NULL**) — fingerprint of the request payload
- `result_ref` (text, NOT NULL) — see “Result ref format + replay” below
- `created_at` (timestamp_ms)
- `expires_at` (timestamp_ms, nullable) — **explicit decision for Step 2:** column exists but we do not enforce expiry yet (future cleanup/GC task)
- **primary key:** `(user_id, scope, key)`

### 1.2 Normalization function

```ts
function normalize(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}
```

### 1.3 `request_hash` canonicalization (must be exact; preserve order + duplicates)

For `scope = "capture_terms"`:

1. Parse terms exactly as capture does (no dedupe; preserve order + duplicates):
   - `rawLines = terms.split(/\r?\n/).map(l => l.trim()).filter(Boolean)`
2. Canonical string is the **exact stored candidate.term list**:
   - `canonical = rawLines.join("\n")`
3. `request_hash = sha256_hex(utf8(canonical))`

Rationale:

- hashing `normalize(term)` is too lossy (would treat casing/whitespace variants as the “same request”)
- hashing the stored representation makes idempotency match DB reality
- `clientRequestId` is required, so `request_hash` is always computed/stored and never null

---

## 2) Auth guard (no guesswork)

We already initialize Better Auth per request in `packages/api/src/index.ts` via `createAuth(...)`.

For `/api/*` routes, add an auth middleware that uses Better Auth’s **session API**.

Preflight (do this first so we don’t bake in a wrong call shape):

- Confirm the exact return shape/signature of `auth.api.getSession(...)` for our installed Better Auth version (currently `better-auth@^1.4.7`) by using TypeScript types/IDE go-to-definition in `packages/api/src/index.ts`.

Implementation requirements (regardless of exact signature):

- Call `getSession` in a way that returns both:
  - the session value (or null)
  - any response headers Better Auth needs the client to receive (notably `set-cookie` for refresh/cleanup)
- If any `set-cookie` header(s) are returned, forward them onto the Hono response using append semantics:
  - `c.res.headers.append("set-cookie", cookieValue)` (do not overwrite)
- **Preflight must bypass auth:** if `c.req.method === "OPTIONS"`, skip session checks and return a successful empty response with CORS headers (see §3.1).
- If `session === null`, return `401` (and still include CORS headers).
- Otherwise, treat `session.user.id` as `userId` for ownership checks and writes.

---

## 3) API routes (Step 2)

### 3.1 CORS

Extend CORS middleware to cover `/api/*` (must include `credentials: true`, and must not use `origin: "*"`) so the SPA on `localhost:5173` can call the worker on `localhost:8787`.

Minimum config:

```ts
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "https://append.tindev.dev"],
    allowMethods: ["POST", "GET", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);
```

**Middleware ordering + OPTIONS rules (no accidental 401 preflight):**

- Keep the existing auth instance initializer `app.use("*", ...)` early (it’s harmless for OPTIONS and keeps `c.get("auth")` available everywhere).
- Register CORS for `/api/*` **before** any `/api/*` auth guard middleware.
- Add an explicit preflight handler **before** the auth guard:
  - `app.options("/api/*", (c) => c.body(null, 204))`
- Auth guard middleware for `/api/*` must either:
  - skip `OPTIONS`, or
  - never run for `OPTIONS` because the preflight route is registered first.

This prevents browser requests from failing at the preflight stage due to auth middleware order.

### 3.2 `POST /api/batch` (idempotent create)

**Request**

```json
{ "terms": "one per line", "clientRequestId": "uuid" }
```

**Response (create + replay share the same JSON shape)**

```json
{ "id": "batch_uuid", "candidateCount": 123 }
```

**Validation**

- `clientRequestId`: required; validate as a **strict UUID** (RFC 4122 string form)
- auth: **requires session**; if missing, return `401 UNAUTHORIZED`
- body size: reject requests > 64 KiB with `413 PAYLOAD_TOO_LARGE`
  - do not rely on `Content-Length` alone (it can be missing/untrusted)
  - implement a small streaming reader that enforces a hard byte limit before JSON parsing
- parse terms:
  - split on `\r?\n`, trim each line, drop empty lines
  - store `candidate.term` as the trimmed line (leading/trailing whitespace not preserved)
  - enforce `20–200` lines after trimming/filtering (Step 2 requirement)
  - enforce per-line length cap (e.g. ≤ 200 chars) to prevent accidental giant lines
  - assign `candidate.position = index` (0-based) in the post-trim list to preserve order

**Create defaults (no implied behavior)**

- `batch.status` on create: `captured`
- `candidate.status` on create: `captured`
- duplicates:
  - duplicates are allowed as distinct candidates (even if `normalize(term)` matches)
  - capture MUST NOT dedupe or merge input lines
  - rationale: keeps “brain dump” faithful and supports the append-only/allowed-but-flagged duplicate philosophy later at `term`/`term_sense` materialization time

**Result ref format + replay (no parsing guesswork)**

- For `scope = "capture_terms"`, `idempotency_key.result_ref` MUST be exactly: `batch:{uuid}`
- Parsing/validation rules:
  - must contain exactly one `:` separator
  - prefix must be `batch`
  - `{uuid}` must match the UUID format generated by the API (treat invalid format as server inconsistency)
- Replay `candidateCount` computation:
  - on replay, compute `candidateCount` as `COUNT(candidate.id)` for `candidate.batch_id = {uuid}`
  - if the referenced batch no longer exists, return `500` (this indicates a DB integrity issue; should never happen in normal operation)

**Idempotency (transactional)**

- scope: `capture_terms`
- Compute `request_hash` using the canonicalization above.
- Transaction (atomicity requirement):
  1. Look up existing row in `idempotency_key` by PK `(user_id, scope, key)`
     - If found and hash matches: return replay (`200`) with the response shape above.
     - If found and hash differs: return `409` (conflict: same `clientRequestId`, different request body).
  2. If not found:
     - create `batch` + `candidate[]`
     - insert `idempotency_key` with `result_ref = "batch:{id}"`
     - return `201`
- Concurrency: if insert races and fails due to PK conflict, re-select and handle as replay/mismatch.

**Prove (don’t assume) D1 + Drizzle transaction semantics:**

- Before relying on the above, add a focused test that intentionally triggers a constraint failure inside the capture transaction and asserts **no rows** are committed (no orphan batch/candidates, no idempotency_key).
- If rollback is not reliable in our runtime driver, switch to a safer write pattern:
  - add `idempotency_key.status = "in_progress" | "completed"` and allow `result_ref` to be nullable until completed, so incomplete attempts can be detected and retried/cleaned up deterministically.
  - (This is a schema change; if we take it, update this plan + `docs/design.md` accordingly.)

### 3.3 `GET /api/batch/:id`

- Require session (401).
- Lookup batch by id:
  - if missing: return `404`
  - if present but `batch.user_id !== session.user.id`: return `403`
- Ordering:
  - return candidates ordered by `candidate.position ASC` (preserves input order)

**Response JSON (explicit contract)**

```json
{
  "id": "batch_uuid",
  "status": "captured",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000,
  "candidateCount": 3,
  "candidates": [
    {
      "id": "candidate_uuid",
      "position": 0,
      "term": "Some term",
      "normalizedTerm": "some term",
      "status": "captured",
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

- Naming convention: JSON uses `camelCase` for multiword fields (e.g. `candidateCount`, `normalizedTerm`, `createdAt`).
- `candidateCount` is always returned (so the client does not have to count and so replay/create shapes stay aligned).

---

## 4) Web routes (Step 2)

### 4.0 Web ↔ API calling convention (no invented patterns)

The Worker API is served from the API origin (same as Better Auth):

- local dev: `http://localhost:8787`
- production: `https://api.append.tindev.dev`

Web must call batch routes using that origin:

- `POST ${API_ORIGIN}/api/batch`
- `GET ${API_ORIGIN}/api/batch/:id`

Fetch defaults for all `/api/*` calls:

- `credentials: "include"` (session cookies)
- `headers: { "content-type": "application/json" }`
- parse JSON on success and on error (when `content-type` is JSON)

Error response shape (new `/api/*` routes must follow this):

```json
{ "error": { "code": "SOME_CODE", "message": "Human readable message" } }
```

Recommended codes for Step 2:

- 400: `VALIDATION_ERROR`
- 400: `INVALID_JSON`
- 413: `PAYLOAD_TOO_LARGE`
- 401: `UNAUTHORIZED`
- 403: `FORBIDDEN`
- 404: `NOT_FOUND`
- 409: `IDEMPOTENCY_CONFLICT`
- 500: `INTERNAL_ERROR`

**Make the error contract enforceable (required implementation detail):**

- Add a tiny shared helper used by all `/api/*` routes:
  - `apiError(c, status, code, message)` → `return c.json({ error: { code, message } }, status)`
- Add global handlers so failures don’t leak mixed/non-contract shapes:
  - `app.onError((err, c) => ...)`:
    - if `c.req.path` does **not** start with `"/api/"`, rethrow (or fall back to default handling) so `/auth/*` behavior is not changed (Better Auth owns those semantics)
    - if JSON parsing fails, return `400 INVALID_JSON` in the contract shape
    - if it’s a known validation error, return `400 VALIDATION_ERROR` in the contract shape
    - otherwise return `500 INTERNAL_ERROR` in the contract shape
  - `app.notFound((c) => ...)`:
    - if `c.req.path` starts with `"/api/"`, return `404 NOT_FOUND` in the contract shape
    - otherwise keep existing behavior (so `/` and `/auth/*` stay unaffected)
- Route implementations must not return ad-hoc `{ message }` bodies or raw text for `/api/*` failures.

### 4.1 `/batch/new`

- Textarea “one per line”
- Shows parsed count
- Generates `clientRequestId` once per submit attempt and reuses it for retries until success
- If the user edits the textarea after a failed attempt, generate a new `clientRequestId` (prevents self-inflicted 409s)

### 4.2 `/batch/:id` (placeholder)

- Fetches `GET /api/batch/:id`
- Displays candidate list read-only

### 4.3 Auth gating (don’t bypass login)

The current web app gates auth inside the `/` route component. Adding `/batch/*` routes must not bypass that gate.

Decision:

- Add a **protected layout route** (session gate + shared header) and put `/batch/*` under it.

**Concrete router shape (TanStack Router; implementable in current `packages/web/src/main.tsx`):**

- Public:
  - `"/sign-in"`: shows the current sign-in prompt/button UI (moved out of `App`)
- Protected layout (pathless layout route; renders header + `Outlet`):
  - gate behavior: `pending → loading`, `no session → redirect to "/sign-in"`, `session → signed-in shell`
  - routes under it:
    - `"/"`: authenticated index route; **explicit decision for Step 2:** redirect to `"/batch/new"` (keeps the slice flow front-and-center)
    - `"/batch/new"`
    - `"/batch/$batchId"` (placeholder)

`"/sign-in"` behavior contract:

- If `useSession()` is pending: show loading.
- If there is **no** session: show the sign-in prompt/button.
- If there **is** a session: redirect to `"/batch/new"`.

This removes auth gating from the current `App` component and makes route placement (under/outside the layout) the source of truth for auth.

Rationale:

- Centralizes auth gating so new routes can’t accidentally bypass login.
- Avoids repeating the same “pending / signed-out / signed-in” UI logic in every page.
- Gives us a natural place for shared nav/header as the app grows (batch, bucket feed, export, etc.).

---

## 5) Testing (Vitest + `cloudflare:test`)

### 5.0 Fix existing boilerplate tests first (keep the repo honest)

`packages/api/test/index.spec.ts` currently asserts `"Hello World!"`, but the worker health route returns JSON `{ "status": "ok" }` at `GET /`.

Step 2 work must start by replacing that boilerplate test with a health-check assertion that matches the actual worker response.

### 5.1 How tests read/write D1 via Drizzle (required for 403 ownership tests)

In tests:

- import `env` from `cloudflare:test` (provides D1 binding as `env.DB`)
- create a Drizzle client:
  - `const db = drizzle(env.DB, { schema })`
  - `schema` comes from `packages/api/src/db/schema.ts` (via `packages/api/src/db/index.ts`)

Use `db.insert(...)`, `db.select(...)`, `db.delete(...)` to seed/clear rows.

Ensure schema exists in the test DB:

- Verify whether the `cloudflare:test` pool applies Wrangler D1 migrations automatically when running `vitest` with `wrangler.jsonc`.
- If migrations are not auto-applied, add a test setup that executes the SQL files in `packages/api/drizzle/*.sql` in order via `env.DB.exec(...)` (once per suite), so tests don’t depend on out-of-band local commands.

### 5.2 How tests mint an authenticated session cookie

Better Auth’s `getSession` reads signed cookies; so tests should mint a real session cookie by enabling credential auth **only for the test environment**.

Plan:

1. Add `emailAndPassword: { ... }` to `createAuth()` only when:
   - `env.ENABLE_TEST_EMAIL_PASSWORD_AUTH === "1"`, **and**
   - `env.BETTER_AUTH_URL` starts with `http://localhost` (prevents accidental enablement in prod).
2. Safety rule (must be enforced in code): if email/password auth is enabled, it must still be gated by the allowlist:
   - for non-Google providers, require `ALLOWED_EMAIL` match (Google `sub` allowlist does not apply)
   - if `ALLOWED_EMAIL` is not configured, fail closed (deny)
   - enforce this in `packages/api/src/lib/auth/index.ts` in the Better Auth `databaseHooks.account.create.before` hook by:
     - checking Google `sub` only for `providerId === "google"`
     - for any non-Google provider, looking up the user email by `userId` and requiring `ALLOWED_EMAIL` match (deny if missing)
3. Configure `packages/api/vitest.config.mts` to run Miniflare using Wrangler environment `"test"`:
   - `wrangler: { configPath: "./wrangler.jsonc", environment: "test" }`
4. In `packages/api/wrangler.jsonc`, add an `"env": { "test": { "vars": { ... }}}` section with:
   - `ENABLE_TEST_EMAIL_PASSWORD_AUTH=1`
   - `BETTER_AUTH_URL=http://localhost:8787` (must be localhost for the guard above)
   - `BETTER_AUTH_SECRET=<test-only-long-random-string>` (cookie signing; ok to be non-secret in local test env)
   - allowlist var for the test user (`ALLOWED_EMAIL=test-a@example.com`)

Then tests can:

- `POST /auth/sign-up/email` (idempotent: ignore “already exists”)
- `POST /auth/sign-in/email`
- capture `set-cookie` and send it back as the `cookie` header for authenticated `/api/*` requests.

### 5.3 Test cases (minimum set)

`POST /api/batch`

- 401 when unauthenticated
- 400 for missing/invalid `clientRequestId`
- 400 for empty terms
- 400 for <20 terms
- 400 for >200 terms
- 400 for any term line > max length
- 413 for payload too large
- 201 creates batch + candidates
- 200 replay with same `clientRequestId` + same `terms`
- 409 on same `clientRequestId` + different `terms`
- normalization: `"  Hello   World  "` stores `normalized_term = "hello world"`

`GET /api/batch/:id`

- 401 when unauthenticated
- 403 for non-owner:
  - seed a “foreign” user + batch + candidate via Drizzle in D1
  - fetch as the signed-in user and expect 403
- 200 for owner

---

## 6) Implementation order (keeps slice runnable)

1. Fix existing worker test (`packages/api/test/index.spec.ts`) so `pnpm --filter @append/api test` is meaningful.
2. Add domain schema + migration (including CHECK constraints for all enums; index `term_sense(term_id, created_at)`).
3. Add `/api/*` CORS + explicit `OPTIONS /api/*` preflight handler + auth guard (session check + `set-cookie` forwarding).
4. Implement `POST /api/batch` + idempotency semantics, plus the transaction rollback proof test.
5. Implement `GET /api/batch/:id` + 403 ownership, and corresponding tests.
6. Add minimal web route tree (protected layout + `/sign-in`) early, then implement `/batch/new` → submit → redirect, plus `/batch/$batchId` placeholder.

## 7) Dev workflow (migrations + local loop)

Schema/migration workflow (API):

- Generate/refresh Better Auth schema (rare; only when auth config changes): `pnpm --filter @append/api auth:generate`
- Generate D1 migrations after schema changes: `pnpm --filter @append/api db:generate`
  - `drizzle-kit` needs a local D1 SQLite file; if it can’t find one, run `pnpm --filter @append/api dev` once to create `.wrangler/**.sqlite`
- Apply migrations locally: `pnpm --filter @append/api db:migrate:local`
- Apply migrations to prod: `pnpm --filter @append/api db:migrate:prod`
