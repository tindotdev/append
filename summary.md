# Session: API Refactoring (Refactor Scout Report)

**Date**: 2026-02-06

## Done

- Created git worktree at `../append-refactor-api` on branch `refactor/api-error-mapping`
- Completed refactor #1: Extract error-mapping helper for bulk operations
  - Created `packages/api/src/shared/bulk-error-map.ts` with `mapBulkOperationError` helper
  - Updated `bulkAccept.ts` and `bulkDelete.ts` to use shared helper
  - Eliminated duplicated error-mapping pattern (switch statements)
  - Commit: `ef43bed`
- Completed refactor #2: Extract optimistic lock version-increment SQL fragment
  - Added `incrementVersion` function to `packages/api/src/shared/optimistic.ts`
  - Replaced 12 occurrences of `version: sql\`${table.version} + 1\`` across 8 files
  - Files updated: `archiveTerm.ts`, `restoreTerm.ts`, `archiveTermSense.ts`, `restoreTermSense.ts`, `updateCandidate.ts`, `updateTerm.ts`, `updateTermSense.ts`
  - Commit: `7a38562`
- All validation passed: typecheck ✓, tests (408 passed) ✓, lint ✓

## Pending

Complete remaining 3 refactors from `docs/refactor-scout-packages-api.md`:

### Refactor #3: Extract ownership error message constructor
**Where**:
- `packages/api/src/features/user-bucket/usecases/ownership.ts:3-6` (`bucketOwnershipError`)
- `packages/api/src/shared/api-error.ts:41-48` (`ownershipErrorMap`)
- Multiple route handlers with not_found/forbidden patterns

**Minimal refactor**: Create unified helper in `shared/api-error.ts`:
```typescript
export function ownershipError(
  resource: string,
  errorType: 'not_found' | 'forbidden'
): { type: 'not_found' | 'forbidden'; message: string } {
  return {
    type: errorType,
    message: errorType === 'not_found' ? `${resource} not found` : 'Access denied',
  };
}
```

Update `deleteBucket.ts` and 2-3 other ownership checks.

**Validation**: typecheck + test + lint (same commands as before)

### Refactor #4: Consolidate day-key parsing with consistent validation
**Where**:
- `packages/api/src/features/dashboard/rollups/time.ts:8-15` (`formatDayKey`)
- `packages/api/src/features/dashboard/rollups/time.ts:58-63` (`parseDayKeyToUtcRange`)
- `packages/api/src/features/dashboard/rollups/time.ts:72-148` (`parseDayKeyToTzRange`)
- `packages/api/src/features/dashboard/rollups/time.ts:177-182` (`isValidDayKey`)

**Minimal refactor**: Extract validated parser in `time.ts`:
```typescript
function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  if (!isValidDayKey(dayKey)) {
    throw new Error(`Invalid day key: ${dayKey}`);
  }
  const [y, m, d] = dayKey.split('-').map((n) => Number(n));
  return { year: y, month: m, day: d };
}
```

Replace 3 occurrences in `parseDayKeyToUtcRange`, `parseDayKeyToTzRange`, `weekdayLabel`.

**Validation**: typecheck + test (dashboard tests use these functions) + lint

### Refactor #5: Simplify idempotency result extraction with typed helper
**Where**:
- `packages/api/src/features/batch/usecases/acceptAll.ts:82-87` (replay check)
- `packages/api/src/features/batch/usecases/acceptAll.ts:92-100` (conflict check)
- `packages/api/src/features/candidate/usecases/acceptCandidate.ts:59-64` (replay check)
- `packages/api/src/features/candidate/usecases/acceptCandidate.ts:68-76` (conflict check)
- `packages/api/src/features/candidate/usecases/acceptCandidate.ts:249-266` (race condition fallback)

**Minimal refactor**: Extract to `shared/idempotency/result-ref.ts`:
```typescript
export function extractIdempotencyResult<T>(
  tag: string,
  resultRef: string
): { success: true; result: T; isReplay: true } | { success: false; error: { type: 'internal_error'; message: string } } {
  const cached = decodeJsonResultRef<T>(tag, resultRef);
  if (!cached) {
    return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
  }
  return { success: true, result: cached, isReplay: true };
}
```

Replace 3 replay-check sites in `acceptAll.ts` and `acceptCandidate.ts`.

**Validation**: typecheck + test (idempotency tests cover this) + lint

## Notes

- **Worktree**: All work in `../append-refactor-api` (separate worktree)
- **Branch**: `refactor/api-error-mapping`
- **Validation commands** (run from worktree root):
  - `pnpm --filter @append/api typecheck`
  - `pnpm --filter @append/api test`
  - `pnpm ci:lint`
- **Dependencies**: Already installed in worktree (took ~14s)
- **Scout report**: Full details in `docs/refactor-scout-packages-api.md`
- **Pattern**: Each refactor should be its own commit with clear message following existing format
- Don't over-DRY: Keep operation-specific logic local, only extract mechanical duplication
- After all 5 refactors complete: merge branch back to main, delete worktree
