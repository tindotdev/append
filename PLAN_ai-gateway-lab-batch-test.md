---
temporary: true
created: 2025-12-28
purpose: Implementation plan for 20-term batch testing in ai-gateway-lab
---

# Plan: 20-Term Batch Test for ai-gateway-lab

## Objective

Extend `packages/ai-gateway-lab` to test 20 terms through the AI Gateway, simulating the SSE event pattern used by the production API (`start` → `candidate` → `done`).

## Context

- **ADR 0009**: API uses SSE streaming for suggestion progress
- **Current lab**: Tests single term ("Cloudflare") with filesystem cache
- **Goal**: Validate AI Gateway + valibot integration at scale before production use

---

## Implementation Checklist

### Phase 1: Define Types and Constants

- [x] Add event type definitions (`StartEvent`, `CandidateEvent`, `DoneEvent`)
- [x] Define 20 test terms covering all 5 buckets
- [x] Add status type: `'ok' | 'cached' | 'error'`

### Phase 2: Create Batch Processor

- [x] Create `processBatch()` async generator function
- [x] Yield `start` event with term count
- [x] Loop through terms:
  - [x] Check filesystem cache first
  - [x] Call AI Gateway if cache miss
  - [x] Handle errors gracefully
  - [x] Yield `candidate` event for each term
- [x] Yield `done` event with aggregated stats

### Phase 3: Update Main Entry Point

- [x] Add CLI flag or env var for batch mode (`BATCH_MODE=1`)
- [x] Keep single-term mode as default for backward compatibility
- [x] Add formatted console output mimicking SSE events

### Phase 4: Testing & Validation

- [x] Run with empty cache (all API calls) — 20 ok, 0 cached, 0 errors
- [x] Run again to verify cache hits — 0 ok, 20 cached, 0 errors
- [x] Verify bucket classifications are reasonable — all terms correctly classified
- [x] Single-term mode backward compatibility verified

---

## File Changes

| File | Change |
|------|--------|
| `packages/ai-gateway-lab/src/index.ts` | Lean entry point, routes to single/batch mode |
| `packages/ai-gateway-lab/src/batch-events.ts` | (new) Event type definitions |
| `packages/ai-gateway-lab/src/batch-processor.ts` | (new) Async generator + formatter |
| `packages/ai-gateway-lab/src/suggest-one.ts` | (new) Core LLM call function |
| `packages/ai-gateway-lab/src/system-prompt.ts` | (new) LLM system prompt |
| `packages/ai-gateway-lab/src/terms.ts` | (new) 20 test terms |

---

## 20 Test Terms

| # | Term | Expected Bucket |
|---|------|-----------------|
| 1 | Hash Table | foundations |
| 2 | Big O Notation | foundations |
| 3 | Binary Search | foundations |
| 4 | Recursion | foundations |
| 5 | REST API | backend |
| 6 | Database Index | backend |
| 7 | Connection Pool | backend |
| 8 | Rate Limiting | backend |
| 9 | React Hooks | frontend |
| 10 | Virtual DOM | frontend |
| 11 | CSS Grid | frontend |
| 12 | State Management | frontend |
| 13 | Webpack | dx-tooling |
| 14 | ESLint | dx-tooling |
| 15 | CI/CD Pipeline | dx-tooling |
| 16 | Hot Module Replacement | dx-tooling |
| 17 | CAP Theorem | deep-concepts |
| 18 | Event Sourcing | deep-concepts |
| 19 | CQRS | deep-concepts |
| 20 | Eventual Consistency | deep-concepts |

---

## Event Structure

```typescript
// Emitted once at start
interface StartEvent {
  termCount: number;
}

// Emitted for each term processed
interface CandidateEvent {
  term: string;
  status: 'ok' | 'cached' | 'error';
  suggestion?: { bucket: Bucket; text: string };
  error?: string;
}

// Emitted once at end
interface DoneEvent {
  ok: number;
  cached: number;
  errors: number;
}
```

---

## Usage

```bash
# Single term (default, backward compatible)
pnpm lab

# Batch mode (20 terms)
BATCH_MODE=1 pnpm lab
```

---

## Notes

- Filesystem cache in `.llm-cache/` prevents redundant API calls
- First run will make 20 API calls; subsequent runs use cache
- Rate limiting: AI Gateway may throttle; consider adding delay if needed
- Delete after implementation is complete
