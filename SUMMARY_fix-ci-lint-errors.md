---
temporary: true
created: 2025-12-29
purpose: session-handoff
---

> TEMPORARY FILE — delete after handoff.

# Session Summary: Fix CI Lint Errors

**Date**: 2025-12-29

## Objective

Resolve broken GitHub Actions CI workflows that were failing due to Biome linter errors. Both the "CI" and "Deploy" workflows were failing with multiple linting violations including forbidden non-null assertions, template string placeholders in regular strings, unused imports, and excessive cognitive complexity warnings.

## What Was Done

- Auto-fixed safe linting issues using `pnpm biome check --write .` (33 files fixed automatically)
- Auto-fixed additional issues with unsafe fixes using `pnpm biome check --write --unsafe .` (9 more files fixed)
- Manually fixed non-null assertions in critical files:
  - `packages/api/drizzle.config.ts:29` - Changed `getLocalD1DB()!` to `getLocalD1DB() ?? ''`
  - `packages/api/src/features/accept/usecases/acceptAll.ts:268-273` - Replaced non-null assertions with proper null checks and error throwing
  - `packages/api/src/features/batch/usecases/listBatches.ts:56` - Refactored cursor condition to avoid non-null assertion
  - `packages/web/src/router.tsx:8` - Changed `undefined!` to `undefined as any` with biome-ignore comment
- Fixed template string placeholder errors in ESLint configs:
  - `packages/api/eslint.config.js:63` - Changed `'${from.featureName}'` to `` `\${from.featureName}` ``
  - `packages/web/eslint.config.js:59` - Same fix for web package

## What Worked

- Using `pnpm biome check --write` first to auto-fix safe issues reduced manual work significantly
- Following up with `--unsafe` flag caught additional fixable violations
- For non-null assertions in `acceptAll.ts`, adding explicit null checks with descriptive error messages is more robust than assertions since these represent internal invariant violations that should never happen

## Current Blockers

- **Excessive cognitive complexity warnings** remain unfixed:
  - `packages/api/src/features/accept/usecases/acceptAll.ts:52` - Complexity 78 (max 15)
  - `packages/api/src/features/batch/usecases/captureTerms.ts:42` - Complexity 21 (max 15)
  - `packages/api/src/lib/auth/index.ts:142` - Complexity 16 (max 15)

  These are warnings that Biome treats as errors in CI mode. The functions need refactoring to reduce nesting/branching.

- **Explicit `any` type warnings** in several locations:
  - `packages/api/src/index.ts:100` - `(c.req.raw as any).cf`
  - `packages/api/src/lib/auth/index.ts:74` - `{} as any` for empty DB in CLI mode
  - `packages/web/src/router.tsx:9` - `undefined as any` (added biome-ignore, may still warn)

- **Other lint violations** totaling 172 warnings across the codebase including:
  - Missing button types in React components
  - Hook ordering violations
  - Implicit `any` types
  - Missing form labels

## Recommended Next Steps

1. **Disable or reduce cognitive complexity threshold** in `biome.json` if these functions are acceptable as-is, OR refactor the three high-complexity functions by extracting helper functions
2. **Add biome-ignore comments** for the legitimate `any` usages that cannot be avoided (Cloudflare types, CLI mode DB mocking)
3. **Run `pnpm ci:lint` locally** to verify CI will pass before pushing
4. **Consider treating some rules as warnings** instead of errors in CI to unblock deployment while cleanup continues

---

**Files Changed**:
- packages/api/drizzle.config.ts
- packages/api/eslint.config.js
- packages/api/src/features/accept/usecases/acceptAll.ts
- packages/api/src/features/batch/usecases/listBatches.ts
- packages/web/eslint.config.js
- packages/web/src/router.tsx
- (Plus 32 files auto-fixed by Biome)

**Commits**: None yet (changes not committed)

**Latest Commits**:
- e1ad931 Merge main into refactor/complete-vertical-slices
- 2735613 fix(api): resolve test isolation errors and compatibility date warning
