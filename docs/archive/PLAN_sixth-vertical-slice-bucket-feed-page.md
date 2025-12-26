# Plan: Sixth Vertical Slice Bucket Feed Page

**Date**: 2025-12-25
**Task**: Implement vertical slice Step 6 (“Bucket feed page”): an authenticated SPA route `/bucket/:slug` backed by an authenticated API endpoint `GET /api/bucket/:slug` with deterministic ordering and cursor pagination.
**Source Prompt**: TASK: `The sixth vertical slice: Bucket feed page` ; FILES: `docs/vertical-slice.md , docs/design.md`

## Inputs Reviewed

- docs/vertical-slice.md
- docs/design.md

## Goal / Success Criteria

- `GET /api/bucket/:slug` returns the exact response shape specified in `docs/vertical-slice.md` Step 6, ordered by `primarySense.createdAt DESC, termId DESC`, with a working `cursor`/`nextCursor` contract.
- `/bucket/:slug` renders a “calm by default” feed showing each term’s `displayTerm` and its `primarySense.text`, supports loading additional pages when `nextCursor` is present, and handles empty/loading/error states.
- `pnpm --filter @append/api test` and `pnpm --filter @append/web build` succeed.

## Constraints

- Architecture remains SPA (React + TanStack Router) + Hono on Cloudflare Workers (docs/design.md; ADR 0004).
- Route is authenticated and lives under the protected layout (docs/vertical-slice.md Step 6; ADR 0005).
- Buckets are the fixed slugs: `foundations | backend | frontend | dx-tooling | deep-concepts` (docs/vertical-slice.md Step 6; docs/design.md).
- Error responses for `/api/*` must use the standard JSON error shape (docs/vertical-slice.md Step 1; `packages/api/src/lib/api-error.ts`).

## Non-goals (explicitly out of scope)

- “Needs review” view and any flagged/conflict surfacing on the bucket feed page (docs/vertical-slice.md Step 6).
- Expand/collapse to show non-primary senses on the feed (docs/design.md mentions expandable UX, but it is not part of Step 6’s slice definition).
- Export page and export API (`docs/vertical-slice.md` Step 7).
- Adding global navigation/menus to discover bucket pages (bucket pages remain directly addressable by URL).

## Locked Decisions (no open questions)

- Bucket slug allowlist is exactly: `foundations | backend | frontend | dx-tooling | deep-concepts` (docs/vertical-slice.md Step 6; `packages/api/src/db/domain.schema.ts`).
- API route and contract:
  - `GET /api/bucket/:slug` (docs/vertical-slice.md Step 6).
  - `limit` query param: default `50`, min `1`, max `200` (docs/vertical-slice.md Step 6).
  - `cursor` query param: base64url-encoded UTF-8 JSON (no padding) of `{ "createdAt": number, "termId": string }` taken from the last item of the previous page, where `createdAt` is the item’s `primarySense.createdAt` (docs/vertical-slice.md Step 6).
  - Response shape: `{ bucket, items, nextCursor }` with `items[].primarySense` fields and timestamps in epoch ms (docs/vertical-slice.md Step 1 + Step 6).
- Ordering and pagination:
  - Order by `primarySense.createdAt DESC`, then `termId DESC` (docs/vertical-slice.md Step 6).
  - `nextCursor` derived from the last returned item’s `{ createdAt, termId }` (docs/vertical-slice.md Step 6).
- “Calm by default” display: show primary sense text only (docs/vertical-slice.md Step 6).

## Specification / Contracts (fully specified)

### API: `GET /api/bucket/:slug`

- **Auth**: Required (enforced by `/api/*` middleware); the response is scoped to the authenticated user’s data.
- **Path params**:
  - `slug`: must be one of `foundations | backend | frontend | dx-tooling | deep-concepts`; otherwise return `404 NOT_FOUND`.
- **Query params**:
  - `limit` (optional): integer; default `50`; min `1`; max `200`. Invalid values return `400 VALIDATION_ERROR`.
  - `cursor` (optional): base64url string encoding UTF-8 JSON (no padding) of `{ createdAt: number, termId: string }`. Any invalid/unparseable cursor returns `400 VALIDATION_ERROR`.
- **Response** (`200 application/json`):
  - `bucket`: the bucket slug.
  - `items`: array of:
    - `termId`: string
    - `displayTerm`: string
    - `canonical`: string
    - `primarySense`: `{ id: string, bucket: bucket slug, text: string, createdAt: number }`
  - `nextCursor`: string (encoded cursor) or `null`
- **Errors** (docs/vertical-slice.md Step 6):
  - `400 VALIDATION_ERROR` (invalid `limit` or invalid/unparseable `cursor`)
  - `401 UNAUTHORIZED`
  - `404 NOT_FOUND` (invalid bucket slug)

### Data/query behavior (D1)

- **DB migrations/index changes**: none for this slice.
- **Filter predicates** (all must be true for a row to be included):
  - `term.user_id = :userId` (scoped to authenticated user)
  - `term.primary_sense_id IS NOT NULL` (term must have a primary sense)
  - `term.archived_at IS NULL` (exclude archived terms)
  - `term_sense.id = term.primary_sense_id` (join to primary sense)
  - `term_sense.bucket = :slug` (primary sense must be in the requested bucket)
  - `term_sense.archived_at IS NULL` (exclude archived senses)
- Items returned correspond to the authenticated user's `term` rows that have a non-null `primary_sense_id` whose referenced `term_sense` row:
  - has `bucket = :slug`
  - provides `primarySense.createdAt` used for ordering and pagination
- Deterministic ordering:
  - `ORDER BY term_sense.created_at DESC, term.id DESC`
- Cursor application (for the above DESC ordering):
  - Decode `cursor` to `{ createdAt, termId }`
  - Apply pagination filter:
    - `term_sense.created_at < createdAt OR (term_sense.created_at = createdAt AND term.id < termId)`
- Page sizing:
  - Query `limit + 1` rows to detect whether a next page exists.
  - If more than `limit` rows are available, return only the first `limit` and set `nextCursor` using the last returned item’s `{ createdAt, termId }`; otherwise set `nextCursor = null`.

### UI: `/bucket/:slug`

- **Route**: `/bucket/$slug` registered under the protected layout (TanStack Router; `packages/web/src/main.tsx`).
- **Slug handling**:
  - If `slug` is not one of the allowed bucket slugs, render a “not found” state without calling the API.
- **Rendering**:
  - Page title uses the same slug→title mapping as `docs/vertical-slice.md` Step 7 export titles:
    - `foundations` → `Foundations`
    - `backend` → `Backend`
    - `frontend` → `Frontend`
    - `dx-tooling` → `DX Tooling`
    - `deep-concepts` → `Deep Concepts`
  - For each item, display:
    - `displayTerm` (primary label)
    - `primarySense.text` (secondary text)
- **States**:
  - Initial load: show “Loading…”
  - Empty feed (`items.length === 0`): show “No items yet.”
  - API error: show a generic “Something went wrong. Please try again.” and preserve the ability to retry by refreshing.
  - Pagination: if `nextCursor` is non-null, show a “Load more” button that appends the next page; disable button while the request is in flight.

## Implementation Plan

1. Add API route implementation in `packages/api/src/routes/bucket.ts` — handles slug validation, `limit` parsing, cursor decode/encode, D1 query, and returns `{ bucket, items, nextCursor }`.
2. Register the new API router in `packages/api/src/index.ts` at `app.route("/api/bucket", bucketRoutes)` — makes `GET /api/bucket/:slug` reachable under existing auth/error middleware.
3. Add API tests in `packages/api/test/bucket.spec.ts` — covers 401 unauthenticated, 404 invalid slug, 400 invalid limit/cursor, ordering, and cursor pagination.
4. Extend the web API client in `packages/web/src/lib/api.ts` — add `BucketFeedResponse` types and a `getBucketFeed(slug, { limit?, cursor? })` function using `credentials: "include"`.
5. Add the page component `packages/web/src/pages/BucketFeedPage.tsx` — fetches initial page, renders items, and implements “Load more” using `nextCursor`.
6. Register the UI route in `packages/web/src/main.tsx` — add a protected route with path `/bucket/$slug` and component `BucketFeedPage`.

## Validation

- API tests: `pnpm --filter @append/api test`
- Web build/typecheck: `pnpm --filter @append/web build`

## Risks & Rollback

- **Risk**: Cursor condition mismatch with DESC ordering can cause duplicates or skipped items across pages.
- **Rollback**: Remove `app.route("/api/bucket", ...)` from `packages/api/src/index.ts` and remove the bucket route/page additions in `packages/web/src/main.tsx` and `packages/web/src/pages/BucketFeedPage.tsx`; delete `packages/api/src/routes/bucket.ts` and `packages/api/test/bucket.spec.ts`.

## Sign-off

- Approved: ready for implementation
- Approved date: 2025-12-25
- Reviewer: unknown
- Notes: —
