# Plan: Seventh Vertical Slice Export Page

**Date**: 2025-12-25
**Task**: Implement Step 7 (“Export page”): add an authenticated `/export` page that downloads deterministic, ENG-LOG-compatible markdown exports (one file per bucket) from a new `GET /api/export/:bucket` endpoint.
**Source Prompt**: TASK: `The seventh vertical slice: Export page` FILES: `docs/vertical-slice.md docs/design.md docs/build-plan.md`

## Inputs Reviewed

- docs/vertical-slice.md
- docs/design.md
- docs/build-plan.md
- docs/testing.md

## Goal / Success Criteria

- Visiting `/export` while authenticated provides per-bucket downloads and a "Download all (5 files)" action.
- `GET /api/export/:bucket` returns a markdown file that exactly matches the Step 7 format, headers, filtering, and ordering rules, and is stable across refreshes.
- API tests cover auth, invalid bucket, deterministic output, ordering, archive filtering, and `display_term` validation (rejecting `:`).

## Constraints

- Architecture: SPA (React + TanStack Router) + Hono on Cloudflare Workers (no SSR). (docs/design.md, docs/build-plan.md)
- All `/api/*` routes require a valid session cookie; unauthenticated requests return `401 UNAUTHORIZED` in the standard JSON error shape. (docs/vertical-slice.md)
- `/api/*` error responses are JSON shaped as `{ "error": { "code": string, "message": string }, "details"?: object }`. (docs/vertical-slice.md)
- Export must be deterministic and stable across refreshes. (docs/vertical-slice.md)

## Non-goals (explicitly out of scope)

- Import/export "preview/commit" flow (Milestone 4).
- Any new navigation framework or global IA beyond adding the `/export` route and page.
- Exporting non-primary senses, flagged/needs-review view, or any additional formats beyond markdown.

## DB Changes

**No D1 schema changes required for this slice.** The export endpoint queries existing `term` and `term_sense` tables; the new `POST /api/batch` validation is application-layer only and does not require any migrations.

## Locked Decisions (no open questions)

- Buckets are exactly: `foundations | backend | frontend | dx-tooling | deep-concepts`. (docs/vertical-slice.md, docs/design.md)
- UI route: `/export` under protected layout (auth-gated). (docs/vertical-slice.md, ADR 0005 referenced there)
- Export API: `GET /api/export/:bucket` returning `text/markdown; charset=utf-8` with `content-disposition: attachment; filename="{bucket}.md"`. (docs/vertical-slice.md)
- Export content uses the term’s primary sense only and includes only terms whose primary sense bucket equals `:bucket`. (docs/vertical-slice.md)
- Export ordering: `primarySense.createdAt ASC`, then `termId ASC`. (docs/vertical-slice.md)
- Download-all triggers 5 downloads in fixed order: `foundations`, `backend`, `frontend`, `dx-tooling`, `deep-concepts`. (docs/vertical-slice.md)
- Export excludes archived `term` rows and archived `term_sense` rows; if a term’s primary sense is archived, omit the term from export. (user clarification, 2025-12-25)
- `/export` triggers downloads on explicit click (not page-load). (user clarification, 2025-12-25)
- UI provides both “download all” and per-bucket downloads. (user clarification, 2025-12-25)
- Download-all continues on failure and reports which buckets succeeded/failed. (user clarification, 2025-12-25)
- Filename handling in the web client is hybrid: use `content-disposition` filename when present, fallback to `{bucket}.md`. (user clarification, 2025-12-25)
- Export delimiter rule: bullet format is `- {displayTerm}: {primarySenseText}` where the first `:` (colon-space) separates term from definition. To guarantee ENG-LOG round-trip fidelity, `display_term` must not contain `:`; this is enforced by validation at term creation/update (existing terms violating this rule, if any, must be migrated or rejected before export is used). Definitions may contain `:` freely. (user clarification, 2025-12-25)

## Specification / Contracts (fully specified)

### API: `GET /api/export/:bucket`

- **Auth**: required (session cookie); otherwise `401 UNAUTHORIZED` with standard JSON error shape.
- **Path param**:
  - `:bucket` must be one of `foundations | backend | frontend | dx-tooling | deep-concepts`; otherwise return `404 NOT_FOUND` with standard JSON error shape.
- **Success response**:
  - Status: `200 OK`
  - Headers (exact):
    - `content-type: text/markdown; charset=utf-8`
    - `content-disposition: attachment; filename="{bucket}.md"`
  - Body (exact format):
    - Includes only terms that:
      - belong to the authenticated user (`term.user_id = session.user.id`)
      - are not archived (`term.archived_at IS NULL`)
      - have a `primary_sense_id` (enforced by join)
      - whose primary sense is not archived (`term_sense.archived_at IS NULL`)
      - whose primary sense bucket equals `:bucket` (`term_sense.bucket = :bucket`)
    - First line: `# {Bucket Title}` with exact mapping:
      - `foundations` → `Foundations`
      - `backend` → `Backend`
      - `frontend` → `Frontend`
      - `dx-tooling` → `DX Tooling`
      - `deep-concepts` → `Deep Concepts`
    - Then a blank line.
    - Then one bullet per exported item: `- {displayTerm}: {primarySenseText}`
      - `{displayTerm}` is `term.display_term` (validated to never contain `:`)
      - `{primarySenseText}` is `term_sense.text` for the primary sense (may contain `:`)
      - **Delimiter rule**: the first `:` (colon-space) separates term from definition; validation guarantees `display_term` never contains `:`, ensuring unambiguous round-trip parsing
    - File ends with a trailing newline (`\n`).
    - If there are zero matching terms, the file is still valid and contains only the header, blank line, and trailing newline.
- **Ordering** (deterministic):
  - Order items by `term_sense.created_at ASC`, then `term.id ASC` (since the joined sense is the primary sense).

### UI: `/export` page

- **Auth gating**: page is only reachable under the protected layout route.
- **Controls**:
  - Per-bucket buttons/links that download exactly one bucket export.
  - One “Download all (5 files)” action that downloads in fixed order: `foundations`, `backend`, `frontend`, `dx-tooling`, `deep-concepts`.
- **Interaction rules**:
  - Downloads happen only on explicit user click.
  - “Download all” is sequential to preserve order; it continues on failure and shows a result summary (success/failure per bucket).
  - Filename selection is hybrid:
    - Parse `content-disposition` header for `filename="..."` and use it when present.
    - Otherwise fallback to `{bucket}.md`.
- **States**:
  - Idle (no downloads in progress).
  - In-progress (disable buttons to prevent overlapping runs).
  - Done (show per-bucket result summary).
  - Error (network/unexpected errors are represented in the per-bucket summary; no silent failures).

## Implementation Plan

### Step 0: Preflight check for existing data violations

Before implementing validation, run a preflight check for any existing `term.display_term` values containing `:`:

```bash
cd packages/api

# Local D1 check:
pnpm exec wrangler d1 execute append-db --local --config wrangler.jsonc --command "SELECT id, display_term FROM term WHERE display_term LIKE '%: %';"

# Production D1 check (read-only):
pnpm exec wrangler d1 execute append-db --remote --config wrangler.jsonc --command "SELECT id, display_term FROM term WHERE display_term LIKE '%: %';"
```

**Expected result**: Zero rows (fresh app has no violations).

**If violations exist** (remediation):

- Option A: Manual fix — update `display_term` to remove/replace `:` before deploying validation.
- Option B: Migration script — run `UPDATE term SET display_term = REPLACE(display_term, ': ', ' - ') WHERE display_term LIKE '%: %';`
- **Block condition**: Do NOT proceed with Step 1 until violations are resolved.

### Step 1: Add `display_term` validation (API)

Enforce rejection of `:` in term text at the **capture entry point**:

| Route             | Field               | Validation                      |
| ----------------- | ------------------- | ------------------------------- |
| `POST /api/batch` | `terms` (each line) | Reject any line containing `:` |

**Exact behavior**:

- In `packages/api/src/routes/batch.ts`, inside the per-line validation loop (after `termLines` is parsed), add:

  ```ts
  if (termLines[i].includes(": ")) {
    return apiError(
      c,
      400,
      "VALIDATION_ERROR",
      `Term at line ${i + 1} contains ': ' which is not allowed`,
    );
  }
  ```

- Return `400 VALIDATION_ERROR` with message `"Term at line N contains ': ' which is not allowed"`.

**Note**: No web form validation needed for this field because the web UI (`BatchNewPage.tsx`) submits raw `terms` text to the API; the API is the single enforcement point for term content. The UI does not expose a `display_term` edit field.

### Step 2: Add API route `GET /api/export/:bucket`

Create `packages/api/src/routes/export.ts` with exact markdown output as specified in Specification section.

### Step 3: Register export routes in the API router

In `packages/api/src/index.ts`, mount `exportRoutes` under `/api/export` alongside existing routes.

### Step 4: Add API tests for export and batch validation

**File**: `packages/api/test/export.spec.ts`

Add tests covering:

- 401 unauthenticated
- 404 invalid bucket
- Correct `content-type` and `content-disposition` headers
- Deterministic body (ordering by `term_sense.created_at ASC`, `term.id ASC`)
- Archive exclusion (term archived, sense archived, both)
- Definitions containing `:` work correctly (delimiter is first occurrence)
- Empty bucket returns valid markdown (header + blank line + trailing newline)

**File**: `packages/api/test/batch.spec.ts` (extend existing)

Add test in `describe("POST /api/batch", ...)`:

| Test Case                        | Expected                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Term containing `:` is rejected | `400 VALIDATION_ERROR` with `error.code = "VALIDATION_ERROR"` and `error.message = "Term at line N contains ': ' which is not allowed"` |

Example test:

```ts
it("rejects terms containing ': '", async () => {
  const res = await app.request("/api/batch", {
    method: "POST",
    headers: { cookie: authCookie },
    body: JSON.stringify({ terms: "valid term\nHTTP: Protocol\nanother term" }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.message).toBe(
    "Term at line 2 contains ': ' which is not allowed",
  );
});
```

### Step 5: Add `/export` page and route

**File**: `packages/web/src/pages/ExportPage.tsx`

Create the export page component:

- Per-bucket download buttons + "Download all (5 files)" action
- Sequential downloads for "Download all" with per-bucket result summary
- States: idle, in-progress (buttons disabled), done (summary shown)

**File**: `packages/web/src/main.tsx`

Register the route under the protected layout using TanStack Router APIs:

1. Add import for the new page:

   ```tsx
   import { ExportPage } from "./pages/ExportPage";
   ```

2. Create the route (after `bucketFeedRoute`):

   ```tsx
   const exportRoute = createRoute({
     getParentRoute: () => protectedRoute,
     path: "/export",
     component: ExportPage,
   });
   ```

3. Add `exportRoute` to the protected route's children in `routeTree`:

   ```tsx
   const routeTree = rootRoute.addChildren([
     signInRoute,
     protectedRoute.addChildren([
       indexRoute,
       batchNewRoute,
       batchDetailRoute,
       bucketFeedRoute,
       exportRoute,
     ]),
   ]);
   ```

### Step 6: Add web API helper for export downloads

**File**: `packages/web/src/lib/api.ts`

Add a download helper that performs the browser download as a side-effect:

```ts
export async function downloadBucketExport(
  bucket: Bucket,
): Promise<
  { success: true; filename: string } | { success: false; error: string }
> {
  const res = await fetch(`/api/export/${bucket}`, { credentials: "include" });

  // Handle error responses (JSON)
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: { message: "Unknown error" } }));
    return {
      success: false,
      error: body.error?.message ?? `HTTP ${res.status}`,
    };
  }

  // Extract filename from content-disposition header, fallback to {bucket}.md
  const disposition = res.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? `${bucket}.md`;

  // Get response as blob and trigger browser download
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Cleanup: remove anchor and revoke object URL
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, filename };
}
```

**Behavior**:

- Fetches markdown from API with credentials
- On error (401/404): parses JSON error and returns `{ success: false, error }`
- On success: extracts filename from `content-disposition` header (fallback `{bucket}.md`), converts response to `Blob`, creates object URL, triggers download via hidden anchor click, cleans up anchor and revokes object URL
- Returns `{ success: true, filename }` after download triggered

### Step 7: Update docs/vertical-slice.md with new rules

**File**: `docs/vertical-slice.md`

Update the following sections to keep the contract current:

1. **Step 2 (`POST /api/batch`) validation**:
   - Add to the request body validation rules:
     > Each term line must not contain `:` (colon-space). If any line contains `:`, return `400 VALIDATION_ERROR` with message `"Term at line N contains ': ' which is not allowed"`.

2. **Step 7 (Export) filtering rules**:
   - Add explicit archive exclusion to the export query description:
     > Export excludes archived terms (`term.archived_at IS NOT NULL`) and terms whose primary sense is archived (`term_sense.archived_at IS NOT NULL`).

3. **Step 7 (Export) delimiter rule**:
   - Add a note explaining the delimiter convention:
     > **Delimiter rule**: The export format `- {displayTerm}: {primarySenseText}` uses the first `:` (colon-space) as the delimiter. To guarantee unambiguous round-trip parsing, `display_term` must not contain `:` (enforced by `POST /api/batch` validation). Definitions may contain `:` freely.

**Acceptance check**: After editing, verify these rules appear in `docs/vertical-slice.md` and are consistent with the implementation.

## Validation

- API tests (includes export + validation): `pnpm test:api`
- Web typecheck: `pnpm typecheck`
- Manual (dev):
  - Run: `pnpm dev`
  - Sign in.
  - Test validation: try creating a term with `display_term` containing `:` (e.g., "HTTP: Protocol"); confirm inline error appears.
  - Visit `/export`.
  - Click "Download all (5 files)" and confirm:
    - 5 downloads occur in the specified order.
    - Each file name matches `content-disposition` (or `{bucket}.md` fallback).
    - File content matches exact header/title mapping and bullet format.
    - Re-downloading without data changes yields byte-identical content (deterministic ordering and trailing newline).

## Risks & Rollback

### Risks

1. **Incorrect archive filtering** — exporting soft-deleted content.
   - Mitigation: API tests explicitly cover archived term, archived sense, and both-archived scenarios.

2. **Existing terms with `:` in `display_term`** — would fail new validation on update (none expected in fresh app).
   - Mitigation: Preflight check (Step 0) must pass before deploying; remediation steps provided.

### Rollback procedure

If Step 7 causes issues in production, execute the following rollback sequence:

```bash
# 1. Identify the last known-good commit (before Step 7 merge)
git log --oneline -10  # Find commit hash, e.g., abc1234

# 2. Revert API changes
cd packages/api
git checkout abc1234 -- src/routes/export.ts src/index.ts
# If export.ts was new, delete it:
rm -f src/routes/export.ts

# 3. Revert web changes
cd ../web
git checkout abc1234 -- src/pages/ExportPage.tsx src/lib/api.ts src/main.tsx
# If ExportPage.tsx was new, delete it:
rm -f src/pages/ExportPage.tsx

# 4. Commit rollback
git add -A && git commit -m "Rollback Step 7 (export page)"

# 5. Redeploy API (Worker)
cd ../api
pnpm exec wrangler deploy --config wrangler.jsonc

# 6. Redeploy web (Pages)
cd ../web
pnpm build && pnpm exec wrangler pages deploy dist --project-name "$CF_PAGES_PROJECT"

# 7. Verify rollback succeeded (authenticated request required)
# Sign into https://append.tindev.dev in a browser, then:
# - Open DevTools Network tab
# - Navigate to https://append.tindev.dev/export
# - Confirm the page shows "Page not found" or redirects to home
# - In the console, run:
#   fetch('https://api.append.tindev.dev/api/export/foundations', { credentials: 'include' })
#     .then(r => console.log('status:', r.status))
# - Confirm status is 404 NOT_FOUND (route removed)
#
# Note: Unauthenticated curl will return 401 due to /api/* auth guard,
# so browser-based verification with session cookie is required.
```

**Rollback verification**:

- `GET /api/export/:bucket` returns `404 NOT_FOUND` when authenticated (route removed)
- `/export` UI route returns "Page not found" or redirects to home
- Existing functionality (batch capture, accept, bucket feed) works normally

## Sign-off

- **v1**: NOT APPROVED — gaps in validation placement, preflight check, and rollback procedure
- **v2**: NOT APPROVED — inconsistent delimiter rule (`:` vs `:`), Step 0 commands not self-contained
- **v3**: NOT APPROVED — rollback uses placeholder hosts and wrong auth expectation; missing batch validation test; missing docs update step
- **v4**: NOT APPROVED — rollback references non-existent `src/routes.tsx`; hardcodes Pages project name; Step 5 missing explicit route registration in `main.tsx`
- **v5**: NOT APPROVED — Step 0 uses `pnpm wrangler` not `pnpm exec wrangler`; no explicit DB migration statement; Step 5 uses wrong route syntax; Step 6 missing download mechanism details
- **v6** (current): Revised to address feedback:
  1. Step 0: Fixed commands to use `pnpm exec wrangler d1 execute ... --config wrangler.jsonc`
  2. Added "DB Changes" section: explicit statement that no D1 schema changes are required
  3. Step 5: Fixed to use exact TanStack Router `createRoute()` API matching `main.tsx` pattern
  4. Step 6: Added complete download mechanism (fetch → blob → createObjectURL → anchor click → cleanup)
  5. Rollback: Fixed deploy commands to use `pnpm exec wrangler ... --config wrangler.jsonc`
- Ready for re-evaluation
