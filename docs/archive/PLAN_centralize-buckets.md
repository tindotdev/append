# Plan: Centralize Buckets via `packages/contracts`

## Goals

- Single source of truth for bucket slugs, labels, and ordering.
- Shared runtime validation using **valibot** while keeping TS-only types isolated.
- Minimal churn in API/Web while preserving existing behavior and export order.

## Proposed Package Structure

```
packages/contracts/
  package.json
  src/
    types/
      index.ts          # TS-only exports (no valibot imports)
    validators/
      index.ts          # valibot schemas + parsing helpers
    index.ts            # re-exports types + validators
```

### `types/index.ts` (TS-only)

- `BUCKETS` constant (canonical order)
- `Bucket` type derived from `BUCKETS`
- `BUCKET_TITLES` (label map)
- `BUCKET_OPTIONS` (slug/label list for UI)
- `BUCKET_LIST` string for prompt text (derived from `BUCKETS`)
- Helper: `isBucket` (type guard)

### `validators/index.ts` (valibot)

- `BucketSchema` using `valibot` (e.g. `v.enum` / `v.picklist`)
- `BucketArraySchema` for lists
- `parseBucket(value)` helper (returns `Bucket` or throws/Result)
- `parseBucketArray(values)` helper

## Implementation Steps

1. **Create `packages/contracts`**
   - Add `package.json` + `src/index.ts`.
   - Add `src/types/index.ts` (no valibot import).
   - Add `src/validators/index.ts` (valibot schemas + helpers).
   - Add to `pnpm-workspace.yaml`.
   - Add dependency on `@append/contracts` in both `packages/api` and `packages/web`.

2. **Refactor API to use contracts**
- `packages/api/src/db/domain.schema.ts`: import `BUCKETS` + `Bucket` from contracts `types`.
- `packages/api/src/routes/export.ts`: import `BUCKET_TITLES` from contracts `types`.
- `packages/api/src/lib/suggestions.ts`: use `BUCKET_LIST` from contracts `types` for prompt.
   - API validation points can optionally switch to `parseBucket` in `validators` when parsing external inputs.

3. **Refactor Web to use contracts**
   - `packages/web/src/lib/api.ts`: replace local `Bucket` type with contracts `types`.
   - `packages/web/src/lib/navigation.ts`: use `BUCKET_OPTIONS`.
   - `packages/web/src/pages/ExportPage.tsx`: import `BUCKETS` + `BUCKET_TITLES`.
   - `packages/web/src/pages/BatchDetailPage.tsx`: use `BUCKETS`.
   - `packages/web/src/pages/BucketFeedPage.tsx`: use `BUCKETS`, `BUCKET_TITLES`, `isBucket`.

4. **Tests + docs**
   - Update API tests to import `BUCKETS` from contracts `types`.
   - Update `docs/design.md` to reference `packages/contracts/src/types` as canonical bucket source.
   - Remove `docs/reference/valibot/README.md` (marked temporary) once implementation is complete.

5. **Validate**
   - Run `pnpm -r --if-present typecheck`.

## Notes

- Generated SQL/migration snapshots remain as-is; only runtime code uses contracts.
- Keep TS-only exports separate so web bundle doesn’t pull `valibot` unless needed.
