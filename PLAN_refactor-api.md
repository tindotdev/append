# Plan: Refactor Api

**Date**: 2026-01-01
**Task**: Implement the safe refactors identified in the refactor scout for `packages/api` to reduce duplication while preserving behavior and API contracts.

## Inputs Reviewed

- packages/api/refactor-scout.md

## Goals

- Reduce duplicated idempotency and ownership checks without changing runtime behavior.
- Keep API responses, error codes/messages, and data shapes identical to current behavior.

## Constraints / Decisions

- No new features, no behavior changes, no architecture changes.
- Avoid over-DRY; only consolidate clearly shared mechanics.
- Implement all four refactor candidates from the scout report, in order.

## Implementation Plan

1. Replace direct idempotency key lookups/inserts with shared helpers — use `findIdempotencyKey(...)` and `createIdempotencyKeyStatement(...)` in the three usecases while preserving per-usecase result parsing.
2. Add `requireBucketOwned` and reuse it in `updateBucket` and `deleteBucket` — keep error messages and `has_senses` logic unchanged.
3. Use `requireBatchOwned` inside `getBatch` — map `not_found`/`forbidden` to existing error types and leave candidate loading intact.
4. Add a bucket-by-slug ownership helper and reuse it in bucket/export routes — preserve 404 messages and response formatting.

## Validation

- Run `pnpm ci:lint` and `pnpm lint:boundaries`.
- Run `pnpm test`.
- Run `pnpm typecheck`.
- Run `pnpm build`.

## Risks & Rollback

- **Risk**: Ownership or idempotency helpers return subtly different data, changing error mapping.
- **Rollback**: Revert the touched files to their previous contents from version control.
