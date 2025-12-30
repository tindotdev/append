# Implementation Roadmap

**Created**: 2025-12-29
**Based on**: User feedback (9 issues) + documentation audit
**Production Version**: v0.3.1

---

## Current Progress

```
Phase 1: Critical Bug Fix       [██████████] 100% COMPLETE
Phase 2: Quick UX Wins          [██████████] 100% COMPLETE
Phase 3: Add shadcn/ui          [██████████] 100% COMPLETE
Phase 3.5: Rate Limit Research  [██████████] 100% COMPLETE
Phase 4: Parallel Suggestions   [██████████] 100% COMPLETE
Phase 5: Custom Buckets         [░░░░░░░░░░]   0% Pending
Phase 6: Documentation          [░░░░░░░░░░]   0% Pending
```

**We are currently at**: Ready for Phase 5 — implementing custom buckets (limit 20)

---

## User Feedback Summary

| #   | Issue                                | Impact   | Status                                   |
| --- | ------------------------------------ | -------- | ---------------------------------------- |
| 1   | 20 terms minimum is too restrictive  | High     | **FIXED** (TERM_MIN=1)                   |
| 2   | Suggestions UX during generation     | Medium   | **FIXED** (progress indicator in Phase 4) |
| 3   | Suggestions generated sequentially   | High     | **FIXED** (parallel with concurrency=10) |
| 4   | Dropdown doesn't close on click away | Low      | **FIXED** (shadcn DropdownMenu)          |
| 5   | Accepted terms should vanish         | Medium   | **FIXED** (collapsed in details section) |
| 6   | No items in bucket page              | Critical | **FIXED** (Accept All button added)      |
| 7   | Want custom buckets (not fixed 5)    | High     | Pending (Phase 5)                        |
| 8   | Export shows empty list              | Critical | **FIXED** (same root cause as #6)        |
| 9   | UI should fit in single page         | High     | **DEFERRED**                             |

---

## Phase 1: Critical Bug Fix ✅ COMPLETE

**Goal**: Unblock core flow (bucket page + export showing no items)

**Root Cause Found**: Frontend was missing "Accept All" button. The `POST /api/batch/:id/accept` endpoint existed but no UI called it.

| Task                      | Status  | Description                                       |
| ------------------------- | ------- | ------------------------------------------------- |
| 1.1 Debug accept-all flow | ✅ Done | Traced materialization - backend was correct      |
| 1.2 Check D1 data         | ✅ Done | Found 0 accepted batches - confirmed missing UI   |
| 1.3 Add Accept All button | ✅ Done | New `accept-batch.ts` + `BatchHeader.tsx` updates |
| 1.4 Wire up handler       | ✅ Done | `BatchDetailPage.tsx` with error handling         |

**Files Changed**:

- `packages/web/src/features/batch/api/accept-batch.ts` (new)
- `packages/web/src/features/batch/components/BatchHeader.tsx`
- `packages/web/src/features/batch/pages/BatchDetailPage.tsx`
- `packages/web/src/lib/api-client.ts` (added `details` to ApiRequestError)

---

## Phase 2: Quick UX Wins ✅ COMPLETE

| Task                         | Status  | File(s)                                      | Description                            |
| ---------------------------- | ------- | -------------------------------------------- | -------------------------------------- |
| 2.1 Lower TERM_MIN to 1      | ✅ Done | `BatchNewPage.tsx`, `captureTerms.schema.ts` | Allow single-term capture              |
| 2.2 Hide accepted candidates | ✅ Done | `CandidateList.tsx`                          | Collapse accepted into details section |

**Files Changed**:

- `packages/web/src/features/batch/pages/BatchNewPage.tsx`
- `packages/api/src/features/batch/validation/captureTerms.schema.ts`
- `packages/api/test/batch.spec.ts` (updated test)
- `packages/web/src/features/batch/components/CandidateList.tsx`

---

## Phase 3: Add shadcn/ui ✅ COMPLETE

| Task                  | Status  | File(s)                                                           | Description                                 |
| --------------------- | ------- | ----------------------------------------------------------------- | ------------------------------------------- |
| 3.1 Install shadcn/ui | ✅ Done | `packages/web/package.json`                                       | Add dependencies + configure                |
| 3.2 Migrate dropdowns | ✅ Done | `ProtectedLayout.tsx`                                             | Replace `<details>` with DropdownMenu       |
| 3.3 Migrate forms     | ✅ Done | `BatchNewPage.tsx`, `CandidateInputs.tsx`, `CandidateActions.tsx` | TanStack Form + Valibot + shadcn components |
| 3.4 Add click-outside | ✅ Done | All dropdown components                                           | Native with shadcn DropdownMenu             |

**Files Changed**:

- `packages/web/src/components/ui/field.tsx` (new - TanStack Form field components)
- `packages/web/src/components/ui/dropdown-menu.tsx` (new)
- `packages/web/src/components/ui/button.tsx` (new)
- `packages/web/src/components/ui/input.tsx` (new)
- `packages/web/src/components/ui/textarea.tsx` (new)
- `packages/web/src/components/ui/select.tsx` (new)
- `packages/web/src/components/ui/label.tsx` (new)
- `packages/web/src/components/layouts/ProtectedLayout.tsx`
- `packages/web/src/features/batch/pages/BatchNewPage.tsx`
- `packages/web/src/features/batch/components/CandidateInputs.tsx`
- `packages/web/src/features/batch/components/CandidateActions.tsx`

---

## Phase 3.5: Rate Limit Research ✅ COMPLETE

**Goal**: Document OpenAI Tier 1 rate limits and determine optimal concurrency for parallel suggestions.

| Task                                         | Status  | Description                                  |
| -------------------------------------------- | ------- | -------------------------------------------- |
| 3.5.1 Add parallel testing to ai-gateway-lab | ✅ Done | Test concurrency levels 1, 3, 5, 10, 20      |
| 3.5.2 Run experiments                        | ✅ Done | Collected timing + rate limit data           |
| 3.5.3 Write ADR 0011                         | ✅ Done | Documented findings and decision             |

**Results** (see ADR 0011):
- Sequential (concurrency=1): 98 seconds for 20 terms
- Parallel (concurrency=10): 10 seconds for 20 terms → **10x speedup**
- No rate limit errors at any concurrency level
- Decision: Use concurrency=10 for production

**Files Changed**:
- `packages/ai-gateway-lab/src/parallel-test.ts` (new)
- `docs/adr/0011-parallel-suggestion-generation.md` (new)

---

## Phase 4: Parallel Suggestions ✅ COMPLETE

| Task                       | Status  | File(s)                                           | Description                                 |
| -------------------------- | ------- | ------------------------------------------------- | ------------------------------------------- |
| 4.1 Parallel LLM calls     | ✅ Done | `generateSuggestions.ts`, `platform/parallel.ts`  | `parallelStream` with concurrency limit=10  |
| 4.2 Update SSE streaming   | ✅ Done | Same file                                         | Results stream as they complete (out-of-order) |
| 4.3 Add progress indicator | ✅ Done | `BatchDetailPage.tsx`, `BatchHeader.tsx`          | Shows "Generating 5/20..." during generation |

**Files Changed**:
- `packages/api/src/platform/parallel.ts` (new - parallel streaming utility)
- `packages/api/src/features/suggestions/usecases/generateSuggestions.ts` (parallel processing)
- `packages/web/src/features/batch/pages/BatchDetailPage.tsx` (progress state)
- `packages/web/src/features/batch/components/BatchHeader.tsx` (progress display)

---

## Phase 5: Custom Buckets (Limit 20) ⏳ Pending

| Task                      | File(s)                                  | Description                                |
| ------------------------- | ---------------------------------------- | ------------------------------------------ |
| 5.1 Schema: bucket table  | `packages/api/src/db/domain.schema.ts`   | `(user_id, slug, name, color?, order)`     |
| 5.2 Migration             | `drizzle/migrations/`                    | Create table, seed defaults per user       |
| 5.3 API endpoints         | New `packages/api/src/features/buckets/` | CRUD for buckets                           |
| 5.4 Update contracts      | `packages/contracts/src/types/index.ts`  | Dynamic bucket type                        |
| 5.5 UI: bucket manager    | New component in web                     | Create/rename/delete/reorder               |
| 5.6 Migrate existing data | Migration script                         | Ensure existing terms link to user buckets |

---

## Phase 6: Documentation ⏳ Pending

| Task                          | File(s)                                 | Description                      |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| 6.1 Extract test helpers      | `packages/api/src/__tests__/helpers.ts` | Complete Phase 2 from testing.md |
| 6.2 Enhance vertical-slice.md | `docs/vertical-slice.md`                | Add summary from archive         |
| 6.3 Update classification     | `docs/README.md`                        | Mark as production-level         |

---

## Deferred Items

| Item                            | Reason                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| Single-page UI redesign         | Revisit after shadcn/ui is in place                          |
| Local storage / session state   | Server-side state is authoritative; adds sync complexity     |
| Revisit Cloudflare architecture | Current stack (Workers, Pages, D1, AI Gateway) is sufficient |

---

## Documentation Audit Results

| Document               | Status                                   |
| ---------------------- | ---------------------------------------- |
| AGENTS.md              | ✅ Up-to-date                            |
| docs/design.md         | ✅ Up-to-date                            |
| docs/runbook.md        | ✅ Up-to-date                            |
| docs/testing.md        | ⚠️ Minor drift (Phase 2 helpers pending) |
| docs/build-plan.md     | ✅ Up-to-date                            |
| docs/vertical-slice.md | ⚠️ Stub only                             |

---

## Technical Decisions Made

1. **shadcn/ui approved** - Professional components, ~50KB bundle increase acceptable
2. **Custom buckets limited to 20** per user to avoid UI complexity
3. **Parallel suggestions** concurrency=10 (10x speedup, no rate limit issues — ADR 0011)
4. **Single-page redesign deferred** - focus on fixes and features first
5. **ai-gateway-lab stays simple** - direct API calls, not worker bindings (rate limits are gateway-level)
