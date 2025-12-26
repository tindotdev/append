# Plan: Implement Fourth Slice UI Review List

**Date**: 2025-12-24
**Task**: Implement the fourth vertical-slice step ("UI review list") by completing the read/write API contracts and updating the `/batch/:id` UI to review suggestions and edit/save per-candidate overrides with optimistic locking.
**Source Prompt**: TASK: `Create a plan for implementing the fourth slice` FILES: `docs/vertical-slice.md,docs/build-plan.md,docs/design.md`

## Inputs Reviewed

- `docs/vertical-slice.md`
- `docs/build-plan.md`
- `docs/design.md`
- `docs/testing.md`
- `packages/api/src/db/domain.schema.ts`

## Goal / Success Criteria

- `GET /api/batch/:id` returns the Step 4 batch read-model with each candidate containing exactly the fields and ordering specified in `docs/vertical-slice.md` Step 4.
- `PUT /api/candidate/:id` supports per-candidate Save and Clear overrides with validation and optimistic-locking conflict detection (`409 VERSION_CONFLICT` with `details.currentVersion`).
- `/batch/:id` renders suggested bucket/text read-only, renders editable "final" bucket/text inputs, and provides explicit `Save` and `Clear overrides` actions with no auto-save.

## Constraints

- SPA routing remains TanStack Router; API remains Hono on Cloudflare Workers (`docs/design.md`, `docs/build-plan.md`).
- All `/api/*` routes require a valid session cookie; otherwise return `401 UNAUTHORIZED` (`docs/vertical-slice.md`).
- `/api/*` error responses use `{ "error": { "code": string, "message": string }, "details"?: object }` (`docs/vertical-slice.md`).
- Allowed bucket slugs are exactly `foundations | backend | frontend | dx-tooling | deep-concepts` (`docs/vertical-slice.md`, `docs/design.md`).
- Candidate edits use atomic conditional updates with `expectedVersion` to prevent TOCTOU races (`docs/design.md`, `docs/vertical-slice.md`).
- No auto-save; all persistence is behind explicit user actions (`docs/vertical-slice.md`).

## Non-goals (explicitly out of scope)

- Implement `POST /api/batch/:id/accept` (Step 5).
- Implement per-item accept UX (explicitly out of scope for the vertical slice).
- Add new web test frameworks/dependencies (web currently has no component tests per `docs/testing.md`).

## DB Schema Prerequisites

**Confirmed**: All required `candidate` columns already exist in `packages/api/src/db/domain.schema.ts`:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `chosenBucket` | text (nullable) | null | User override for bucket |
| `chosenText` | text (nullable) | null | User override for text |
| `version` | integer | 1 | Optimistic locking |
| `suggestedBucket` | text (nullable) | null | AI suggestion bucket |
| `suggestedText` | text (nullable) | null | AI suggestion text |
| `suggestionStatus` | text (nullable) | null | `in_progress \| done \| error` |
| `suggestionError` | text (nullable) | null | Error message if failed |
| `suggestionAttempts` | integer | 0 | Retry counter |
| `materializedTermId` | text (nullable) | null | Step 5 pointer |
| `materializedTermSenseId` | text (nullable) | null | Step 5 pointer |

**No migration required** — schema is already in place from Step 3.

## Locked Decisions (no open questions)

- Architecture: SPA (React + TanStack Router) + Hono API on Cloudflare Workers (`docs/design.md`, `docs/build-plan.md`).
- Auth gating: protected layout route (ADR 0005 referenced in `docs/design.md`; Step 4 route is authenticated per `docs/vertical-slice.md`).
- Buckets are stable slugs and enforced consistently across DB/API/UI (`docs/design.md`, `docs/vertical-slice.md`).
- Concurrency control: optimistic locking with `expectedVersion` and `409 VERSION_CONFLICT` (`docs/design.md`, `docs/vertical-slice.md`).

## Specification / Contracts (fully specified)

### Route: `/batch/:id` (UI)

#### Loading States

| State | Condition | UI Copy / Behavior |
|-------|-----------|-------------------|
| Loading | `useQuery` pending | Spinner or skeleton; no form controls |
| Error 401 | Fetch returns 401 | Redirect to `/sign-in` (handled by protected layout) |
| Error 403 | Fetch returns 403 | "You don't have access to this batch." (centered message) |
| Error 404 | Fetch returns 404 | "Batch not found." (centered message) |
| Error 5xx | Fetch returns 500+ | "Something went wrong. Please try again." + Retry button |
| Success | Data loaded | Render candidate list |

#### Per-Candidate Row States

| State | Condition | UI Behavior |
|-------|-----------|-------------|
| Idle | Default | Bucket dropdown + text input enabled; Save + Clear buttons enabled |
| Saving | PUT in flight | Disable bucket/text inputs; show spinner on Save button; disable Clear |
| Save Success | PUT 200 | Update row from response; re-enable controls; brief success indicator (1s) |
| Save Error (400) | PUT 400 | Re-enable controls; show inline error: "Invalid input: {message}" |
| Save Error (409) | PUT 409 | Re-fetch batch; reset row draft to new server state; show toast: "This row was modified elsewhere. Your changes were not saved." |
| Save Error (5xx) | PUT 500+ | Re-enable controls; show inline error: "Save failed. Please try again." |
| Missing Suggestion | `suggestedBucket` is null | Show "Pending" badge; bucket dropdown defaults to empty; text input empty |
| Suggestion Error | `suggestionStatus === 'error'` | Show "Suggestion failed" badge with `suggestionError` in tooltip |
| Suggestion In Progress | `suggestionStatus === 'in_progress'` | Show "Generating..." badge; disable Save (no valid suggestion yet) |

#### UI Copy (Exact Strings)

- Page title: "Review Batch"
- Bucket dropdown label: "Bucket"
- Text input label: "Definition"
- Save button: "Save"
- Clear button: "Clear overrides"
- Missing suggestion badge: "Pending"
- In-progress badge: "Generating..."
- Error badge: "Suggestion failed"
- 409 toast: "This row was modified elsewhere. Your changes were not saved."
- Empty state (no candidates): "No candidates in this batch."

#### Acceptance Criteria

- [ ] Loading spinner shown while batch is fetching
- [ ] 403/404/5xx states display the specified messages
- [ ] Each candidate row displays term, normalized term (if different), suggested bucket/text (read-only)
- [ ] Bucket dropdown contains exactly: `foundations`, `backend`, `frontend`, `dx-tooling`, `deep-concepts`
- [ ] Text input accepts single-line text up to 500 characters
- [ ] Save button calls PUT with current draft values and `expectedVersion`
- [ ] Clear button calls PUT with `chosenBucket: null, chosenText: null`
- [ ] 409 conflict triggers batch re-fetch and displays toast
- [ ] Row inputs are disabled during save
- [ ] Missing/in-progress/error suggestion states display correct badges
- [ ] Suggestion error tooltip shows `suggestionError` text

### Endpoint: `GET /api/batch/:id` (read model)

- Auth: required; owner-only (`403` if not owner; `404` if missing).
- Response `200` JSON:
  - `id`: string
  - `status`: `captured | suggested | accepted`
  - `createdAt`: number (epoch ms)
  - `updatedAt`: number (epoch ms)
  - `candidateCount`: number
  - `candidates`: ordered by `position ASC`, each candidate object includes exactly:
    - `id`: string
    - `position`: number
    - `term`: string
    - `normalizedTerm`: string
    - `status`: `captured | suggested | accepted`
    - `chosenBucket`: bucket slug or null
    - `chosenText`: string or null
    - `suggestedBucket`: bucket slug or null
    - `suggestedText`: string or null
    - `suggestionStatus`: `in_progress | done | error` or null
    - `suggestionError`: string or null
    - `suggestionAttempts`: number
    - `version`: number
    - `materializedTermId`: string or null
    - `materializedTermSenseId`: string or null
    - `createdAt`: number (epoch ms)
    - `updatedAt`: number (epoch ms)
- Error responses:
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`
  - `404 NOT_FOUND`

### Endpoint: `PUT /api/candidate/:id` (write model)

- Auth: required; owner-only (if candidate missing, `404 NOT_FOUND`; if candidate exists but batch not owned, `403 FORBIDDEN`).
- Request body JSON:
  - `expectedVersion`: integer (required)
  - `chosenBucket`: bucket slug or `null` (optional key)
  - `chosenText`: string or `null` (optional key)
- Partial update semantics:
  - If a key is omitted, that field is not changed.
  - If a key is present with `null`, that field is cleared.
  - At least one of `chosenBucket` or `chosenText` must be present in the request body.
- Validation:
  - `chosenBucket` (if key present and value not null) must be one of: `foundations | backend | frontend | dx-tooling | deep-concepts`.
  - `chosenText` (if key present and value not null) must be:
    - trimmed
    - non-empty after trimming
    - a single line (no `\n`)
    - max 500 characters
  - Setting both fields to null is allowed and clears overrides.

#### Atomic Optimistic Locking (D1 Strategy)

The update uses a **single conditional UPDATE** to prevent TOCTOU races:

```sql
UPDATE candidate
SET
  chosen_bucket = :chosenBucket,
  chosen_text = :chosenText,
  version = version + 1,
  updated_at = :now
WHERE id = :id AND version = :expectedVersion
```

**Conflict detection**:
- Execute the UPDATE and check `changes()` (rows affected).
- If `changes() === 0`:
  - Re-SELECT the candidate to get `currentVersion`.
  - If candidate exists: return `409 VERSION_CONFLICT` with `details.currentVersion`.
  - If candidate was deleted: return `404 NOT_FOUND`.
- If `changes() === 1`: success; return the updated candidate.

**No transaction wrapper needed** — the single atomic UPDATE is sufficient.

#### Retry Semantics (Client Behavior)

| Scenario | Client Behavior |
|----------|-----------------|
| Network timeout / unknown outcome | Re-fetch `GET /api/batch/:id` to determine current state. If version incremented with expected values, treat as success. Otherwise, re-prompt user. |
| `200` success | Update local state with response; increment local version. |
| `400` validation error | Display error inline; do not retry automatically. |
| `409` version conflict | Re-fetch batch; reset row draft to server state; show toast. Do not retry automatically. |
| `5xx` server error | Display error; allow manual retry. |

**Replaying identical requests**: A repeated PUT with the same `expectedVersion` after a successful save will fail with `409` (version already incremented). This is expected — clients must use the new version from the previous response.

- Success:
  - `200` JSON body: `{ "candidate": <Candidate> }`
  - `<Candidate>` is exactly the candidate object shape used in `GET /api/batch/:id` (`candidates[]` entries).
  - On success, increment `candidate.version` by `1`.
- Error responses:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `403 FORBIDDEN`
  - `404 NOT_FOUND`
  - `409 VERSION_CONFLICT`

## Implementation Plan

1. Align web/API types to the Step 4 read-model — update `packages/web/src/lib/api.ts` so `Candidate` and `BatchResponse` match the Step 4 `GET /api/batch/:id` shape exactly (including suggestion + chosen + version/materialization fields).
2. Implement `PUT /api/candidate/:id` in the Worker — add `packages/api/src/routes/candidate.ts`, export `candidateRoutes`, and register it in `packages/api/src/index.ts` via `app.route("/api/candidate", candidateRoutes)`; implement the handler flow:
   - Parse JSON body; validate `expectedVersion` is an integer and at least one of `chosenBucket`/`chosenText` keys is present.
   - Validate `chosenBucket` (if present and not null) is in the allowed bucket slug list; validate `chosenText` (if present and not null) per Step 4 rules.
   - Load candidate by id; if missing return `404 NOT_FOUND`.
   - Verify ownership via the candidate's batch; if not owner return `403 FORBIDDEN`.
   - Execute atomic conditional UPDATE with `WHERE version = expectedVersion`; check `changes()`.
   - If no rows affected: re-SELECT to get `currentVersion` and return `409 VERSION_CONFLICT`.
   - If 1 row affected: return `{ candidate: <Candidate> }` using the same candidate shape as `GET /api/batch/:id`.
3. Update the `/batch/:id` UI to be a real review list — modify `packages/web/src/pages/BatchDetailPage.tsx` to:
   - Implement all loading/error states per the UI spec above.
   - Render suggested bucket/text read-only from `suggestedBucket`/`suggestedText`.
   - Render suggestion status badges (Pending, Generating..., Suggestion failed with tooltip).
   - Maintain per-candidate draft state keyed by `candidate.id` with initial values `chosen* ?? suggested*` and a per-row saving/error state.
   - Wire `Save` to call `PUT /api/candidate/:id` with `expectedVersion` and the current draft values, then update the local row state from the API response (including the new `version`).
   - Wire `Clear overrides` to call `PUT /api/candidate/:id` with `expectedVersion`, `chosenBucket: null`, `chosenText: null`, then set drafts back to `suggested*` and update local row state from the API response.
   - Handle `409 VERSION_CONFLICT` by re-fetching `GET /api/batch/:id`, resetting drafts for the conflicting candidate(s), and showing a toast.
   - Disable inputs and show spinner during save.
4. Add API integration tests for Step 4 writes and tighten Step 4 reads — add `packages/api/test/candidate.spec.ts` and extend `packages/api/test/batch.spec.ts`:
   - `PUT /api/candidate/:id` tests: `401` unauthenticated; `404` missing; `403` non-owner; `400` missing `expectedVersion`; `400` missing both patch keys; `400` invalid bucket; `400` chosenText empty; `400` chosenText contains `\n`; `400` chosenText > 500 chars; `409` version conflict returns `details.currentVersion`; `200` updates fields and increments `version`.
   - `GET /api/batch/:id` test: assert each candidate includes the Step 4 fields (present and `null` where applicable) in addition to existing assertions.
5. Remove contract drift — update the inline doc comment in `packages/api/src/routes/batch.ts` for `GET /api/batch/:id` to match the Step 4 response shape, and flip Step 4 to `[x]` in `docs/vertical-slice.md` after implementation and tests pass.

## Validation

```bash
# API tests (includes new candidate.spec.ts)
pnpm --filter @append/api test

# Typecheck both packages
pnpm typecheck

# Web build (ensures route compiles)
pnpm --filter @append/web build
```

**Manual UI sanity** (requires Step 1 auth config from `docs/vertical-slice.md`):

1. Ensure Worker runtime config is set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and at least one of `ALLOWED_SUB` or `ALLOWED_EMAIL`.
2. Start dev: `pnpm dev` (or `pnpm dev:api` + `pnpm dev:web`).
3. Create a batch at `/batch/new`, run suggestions, open `/batch/:id`.
4. Verify:
   - Suggested bucket/text display read-only.
   - `Save` updates `chosenBucket`/`chosenText` and increments `version`.
   - `Clear overrides` clears both fields.
   - Open a second tab, save in tab A, then save in tab B → tab B shows 409 toast and refreshes.

## Risks & Rollback

### Risks

- **Risk**: Version conflicts (`409 VERSION_CONFLICT`) can occur if the same candidate is edited from multiple tabs; UI must surface the conflict and refresh the candidate state.
- **Risk**: Atomic UPDATE depends on D1 returning accurate `changes()` count; if driver misbehaves, false-positive 409s could occur.

### Rollback Commands

If rollback is needed, execute in order:

```bash
# 1. Restore API candidate route (if created)
git checkout HEAD -- packages/api/src/routes/candidate.ts 2>/dev/null || true
git checkout HEAD -- packages/api/src/index.ts

# 2. Restore API types and batch route
git checkout HEAD -- packages/api/src/routes/batch.ts

# 3. Restore web files
git checkout HEAD -- packages/web/src/lib/api.ts
git checkout HEAD -- packages/web/src/pages/BatchDetailPage.tsx

# 4. Remove new test file (if created)
rm -f packages/api/test/candidate.spec.ts

# 5. Restore docs
git checkout HEAD -- docs/vertical-slice.md
```

**Verify rollback succeeded**:

```bash
# Should pass with pre-change behavior
pnpm --filter @append/api test
pnpm typecheck
pnpm --filter @append/web build
```

## Sign-off

- Approved: ready for implementation
- Approved date: 2025-12-24
- Reviewer: codex
- Notes: second attempt
