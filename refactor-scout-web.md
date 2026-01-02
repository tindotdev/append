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

- SCOPE: @packages/web/
- Note: SCOPE limits the files/globs to scan; leave empty to scan the repo.

#### Verification commands (discovered)

- Lint: `pnpm ci:lint` and `pnpm lint:boundaries`
- Tests: `pnpm test`
- Typecheck (if any): `pnpm typecheck`
- Build (if any): `pnpm build`

#### Ranked refactor shortlist

1. Centralize repeated `ApiRequestError` parsing for RPC responses in web fetchers.
   - Where: `packages/web/src/features/batch/api/create-batch.ts` `createBatch`, `packages/web/src/features/batch/api/get-batch.ts` `getBatch`, `packages/web/src/features/batch/api/list-batches.ts` `listBatches`, `packages/web/src/features/batch/api/update-candidate.ts` `updateCandidate`, `packages/web/src/features/batch/api/accept-batch.ts` `acceptBatch`, plus similar blocks in `packages/web/src/lib/user-buckets.ts` `listUserBuckets` and `packages/web/src/features/settings/api/user-bucket.ts` `useCreateBucket`/`useUpdateBucket`/`useDeleteBucket`/`useReorderBuckets`.
   - Smell: identical `if (!res.ok) { const errorBody = await res.json(); throw new ApiRequestError(...) }` blocks repeated across multiple RPC clients.
   - Minimal refactor: add a small helper in `packages/web/src/lib/api-rpc.ts` (e.g., `throwApiError(res)` or `parseApiError(res)`) that only builds the `ApiRequestError` with code/message (and optional details if provided), then replace the repeated blocks with the helper.
   - Don’t over-DRY: keep per-endpoint request/response typing and any endpoint-specific error augmentation (e.g., version conflict metadata) in the calling file.
   - Validation plan: `pnpm ci:lint`, `pnpm lint:boundaries`, `pnpm test`, `pnpm typecheck`.

2. Deduplicate version-conflict error handling between term and term-sense updates.
   - Where: `packages/web/src/features/bucket/api/update-term.ts` `updateTerm` and `packages/web/src/features/bucket/api/update-term-sense.ts` `updateTermSense`.
   - Smell: both functions parse error bodies and manually attach `currentVersion` to `ApiRequestError` in the same way.
   - Minimal refactor: extract a tiny helper in `packages/web/src/features/bucket/api/` (or `packages/web/src/lib/api-rpc.ts`) that accepts `(res)` and returns/throws `ApiRequestError` while attaching `currentVersion` when present; reuse it in both functions.
   - Don’t over-DRY: keep each endpoint’s request/response types and hook invalidation logic separate; only share the error parsing.
   - Validation plan: `pnpm ci:lint`, `pnpm lint:boundaries`, `pnpm test`, `pnpm typecheck`.

3. Consolidate ownership error parsing for user-bucket mutations.
   - Where: `packages/web/src/features/settings/api/user-bucket.ts` `useUpdateBucket` and `useDeleteBucket` (plus `useCreateBucket` and `useReorderBuckets` if you generalize the error parsing shape).
   - Smell: repeated blocks read `res.json()` and raise `ApiRequestError` with the same code/message handling.
   - Minimal refactor: create a local helper in `packages/web/src/features/settings/api/user-bucket.ts` that maps `Response` to `ApiRequestError` for that file’s mutations; keep it file-local to avoid over-generalization.
   - Don’t over-DRY: retain `useDeleteBucket`’s `details` attachment for `senseCount` and leave `useCreateBucket`’s request shaping separate.
   - Validation plan: `pnpm ci:lint`, `pnpm lint:boundaries`, `pnpm test`, `pnpm typecheck`.

4. Standardize RPC response handling for import/export endpoints.
   - Where: `packages/web/src/features/import/api/get-import-history.ts` `getImportHistory`, `packages/web/src/features/import/api/preview-import.ts` `previewImport`, `packages/web/src/features/import/api/commit-import.ts` `commitImport`, `packages/web/src/features/export/api/get-export-history.ts` `getExportHistory`.
   - Smell: these already use `handleRpcResponse`, but each call repeats the same `return handleRpcResponse<...>(res)` pattern.
   - Minimal refactor: add a small wrapper like `rpcJson<T>(res)` or re-export `handleRpcResponse` as `rpcJson` to standardize naming and intent; usage becomes a one-liner and keeps error behavior unchanged.
   - Don’t over-DRY: keep per-feature type definitions and request construction in each file; only rename/alias the response handler for clarity.
   - Validation plan: `pnpm ci:lint`, `pnpm lint:boundaries`, `pnpm test`, `pnpm typecheck`.

#### Validation checklist (after any refactor)

- Run lint + tests; refactor must pass with zero errors.
