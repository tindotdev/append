### Refactor Scout Report

```markdown
---
temporary: true
created: 2026-01-02
purpose: refactor-scout
---

> TEMPORARY FILE — delete after handoff.
```

#### Scope

- SCOPE:
- Note: SCOPE limits the files/globs to scan; leave empty to scan the repo.

#### Verification commands (discovered)

- Lint: `pnpm ci:lint` and `pnpm lint:boundaries` (from `package.json` and `.github/workflows/ci.yml`)
- Tests: `pnpm test` (from `package.json` and `.github/workflows/ci.yml`)
- Typecheck (if any): `pnpm typecheck` (from `package.json` and `.github/workflows/ci.yml`)
- Build (if any): `pnpm build` (from `package.json`; web deploy uses `pnpm --filter @append/web run build` in `.github/workflows/deploy.yml`)

#### Ranked refactor shortlist

1. **Where:** `packages/api/src/features/import/usecases/getImportHistory.ts` `getImportHistory`
   **Smell:** The file fetch query uses `where(eq(importFile.importRunId, importFile.importRunId))` (tautology) and then filters in JS with `files = allFiles.filter((f) => runIds.includes(f.importRunId))`, which duplicates filtering logic and loads more rows than needed.
   **Minimal refactor:** Replace the tautological WHERE with an `inArray(importFile.importRunId, runIds)` filter and drop the in-memory `filter(...)` step. Keep the rest of the grouping logic the same to preserve response shape.
   **Don’t over-DRY:** Keep the per-run file grouping and mapping inline; avoid extracting a generic “paginate + join” helper since only this use case needs the file-attachment join.
   **Validation plan:** `pnpm ci:lint` + `pnpm lint:boundaries` + `pnpm test` + `pnpm typecheck`.

2. **Where:** `packages/api/src/features/term/usecases/updateTerm.ts` `updateTerm`, `packages/api/src/features/term-sense/usecases/updateTermSense.ts` `updateTermSense`, `packages/api/src/features/candidate/usecases/updateCandidate.ts` `updateCandidate`
   **Smell:** All three usecases repeat the same optimistic-lock conflict handling: check `updateResult.length === 0`, re-query the current row, return `not_found` if missing, else return `version_conflict` with currentVersion. This is duplicated error-handling logic across files.
   **Minimal refactor:** Extract a tiny shared helper in `packages/api/src/shared/` (e.g., `optimistic.ts`) that takes `db`, a `findCurrent` callback, and a `version` accessor, and returns `{ notFound: boolean, currentVersion?: number }`. Use it in each usecase to build the same error response.
   **Don’t over-DRY:** Keep each usecase’s update-set construction and success response mapping in place; only share the conflict-resolution fragment to avoid coupling table-specific details.
   **Validation plan:** `pnpm ci:lint` + `pnpm lint:boundaries` + `pnpm test` + `pnpm typecheck`.

3. **Where:** `packages/api/src/features/term-sense/usecases/updateTermSense.ts` `updateTermSense`, `packages/api/src/features/candidate/usecases/updateCandidate.ts` `updateCandidate`, existing helper in `packages/api/src/shared/queries.ts` `findUserBucketBySlug`
   **Smell:** Both usecases perform identical bucket existence checks with `db.query.bucket.findFirst` for `(userId, slug)` and then map to `invalid_bucket`. The helper `findUserBucketBySlug` already encapsulates this lookup but is unused here.
   **Minimal refactor:** Replace inline bucket queries with `findUserBucketBySlug(db, userId, bucketSlug)` (or `chosenBucket`) and keep the same `invalid_bucket` error shaping. This consolidates the query logic without changing behavior.
   **Don’t over-DRY:** Keep the “only validate when bucket is provided” branching local to each usecase; don’t push conditional semantics into the shared helper.
   **Validation plan:** `pnpm ci:lint` + `pnpm lint:boundaries` + `pnpm test` + `pnpm typecheck`.

4. **Where:** `packages/api/src/features/import/usecases/previewImport.ts` `previewImport`, `packages/api/src/features/import/usecases/commitImport.ts` `collectImportEntries`
   **Smell:** Both functions loop R2 objects, call `getFileContent`, parse via `parseMarkdown`, and extract `filename` from the key. This repeated file-parsing boilerplate risks drift between preview and commit logic.
   **Minimal refactor:** Introduce a small helper (e.g., `parseImportFile` in `packages/api/src/features/import/parser/` or `usecases/`) that returns `{ filename, entries, warnings }` for a given R2 object. Reuse it in both `previewImport` and `collectImportEntries` while keeping their per-usecase filtering/stats intact.
   **Don’t over-DRY:** Keep preview-only stats (counts, warnings aggregation) and commit-only filtering (bucket mapping, inbox skips) in their respective functions; the helper should only centralize “read + parse + filename” steps.
   **Validation plan:** `pnpm ci:lint` + `pnpm lint:boundaries` + `pnpm test` + `pnpm typecheck`.

#### Validation checklist (after any refactor)

- Run lint + tests; refactor must pass with zero errors.
