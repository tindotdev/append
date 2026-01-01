### Refactor Scout Report

#### Scope

- SCOPE: packages/api routes, usecases, and shared helpers (idempotency + ownership + bucket lookup).

#### Verification commands (discovered)

- Lint: pnpm ci:lint; pnpm lint:boundaries; format/check: pnpm format / pnpm check
- Tests: pnpm test
- Typecheck (if any): pnpm typecheck
- Build (if any): pnpm build

#### Ranked refactor shortlist

1. Consolidate idempotency key lookups/inserts via shared helpers
   - Where: `packages/api/src/features/batch/usecases/captureTerms.ts` (`captureTerms` race handler), `packages/api/src/features/accept/usecases/acceptAll.ts` (conflict + race handlers), `packages/api/src/features/import/usecases/commitImport.ts` (race handler), and `packages/api/src/shared/idempotency/keys.ts` (`findIdempotencyKey`, `createIdempotencyKeyStatement`).
   - Smell: same `db.query.idempotencyKey.findFirst` pattern and insert construction repeated across three usecases, risking drift if the tuple changes.
   - Minimal refactor: replace direct `db.query.idempotencyKey.findFirst` calls with `findIdempotencyKey(...)`, and use `createIdempotencyKeyStatement(...)` for insert builders while keeping the surrounding replay/conflict logic unchanged.
   - Don’t over-DRY: keep per-usecase result parsing (`parseResultRef` vs `decodeJsonResultRef`) and error messages local; only centralize the shared key fetch/insert mechanics.
   - Validation plan: `pnpm ci:lint`; `pnpm lint:boundaries`; `pnpm test`; `pnpm typecheck`; `pnpm build`.

2. Introduce a bucket ownership helper for update/delete
   - Where: `packages/api/src/features/user-bucket/usecases/updateBucket.ts` (`updateBucket`), `packages/api/src/features/user-bucket/usecases/deleteBucket.ts` (`deleteBucket`), and `packages/api/src/shared/queries.ts` (new `requireBucketOwned` alongside `requireBatchOwned`).
   - Smell: duplicated ownership lookup (`select { id, userId }` + not_found/forbidden checks) in two usecases.
   - Minimal refactor: add `requireBucketOwned(db, userId, bucketId)` returning the same `{ ok: true | false }` shape and reuse it in both usecases, mapping errors to existing messages.
   - Don’t over-DRY: keep `has_senses` logic in `deleteBucket` and update-field handling in `updateBucket` unchanged; only share the ownership check.
   - Validation plan: `pnpm ci:lint`; `pnpm lint:boundaries`; `pnpm test`; `pnpm typecheck`; `pnpm build`.

3. Reuse `requireBatchOwned` in `getBatch`
   - Where: `packages/api/src/features/batch/usecases/getBatch.ts` (`getBatch`) and `packages/api/src/shared/queries.ts` (`requireBatchOwned`).
   - Smell: `getBatch` re-implements the same batch ownership check already codified in `requireBatchOwned`.
   - Minimal refactor: call `requireBatchOwned` at the top of `getBatch` and map `{ not_found | forbidden }` to the existing `GetBatchError` types; keep candidate loading and mapping intact.
   - Don’t over-DRY: only share the ownership check; keep response shaping and candidate query local to `getBatch`.
   - Validation plan: `pnpm ci:lint`; `pnpm lint:boundaries`; `pnpm test`; `pnpm typecheck`; `pnpm build`.

4. Centralize bucket-by-slug lookup error handling for routes
   - Where: `packages/api/src/features/bucket/routes.ts` (`bucketRoutes`), `packages/api/src/features/export/routes.ts` (`exportRoutes`), and `packages/api/src/shared/queries.ts` (`findUserBucketBySlug`).
   - Smell: both routes repeat the same lookup + 404 handling for missing buckets.
   - Minimal refactor: add a `requireUserBucketBySlug` helper (or a small wrapper returning `{ ok | error }`) in `shared/queries.ts` and use it in both routes; keep the same 404 message text.
   - Don’t over-DRY: keep response formatting separate (JSON payload vs markdown `Response` headers); only share the lookup + not-found decision.
   - Validation plan: `pnpm ci:lint`; `pnpm lint:boundaries`; `pnpm test`; `pnpm typecheck`; `pnpm build`.

#### Validation checklist (after any refactor)

- Run lint + tests; refactor must pass with zero errors.
