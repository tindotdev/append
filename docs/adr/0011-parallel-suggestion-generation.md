# ADR 0011 — Parallel Suggestion Generation

Status: Accepted
Date: 2025-12-29

## Context

Suggestion generation for batch terms is slow. Processing 20 terms sequentially takes ~100 seconds (5 seconds per LLM call). Users reported this as a high-impact issue.

We needed to determine:
1. Whether parallelization is safe given OpenAI rate limits
2. What concurrency level to use
3. How to handle partial failures

## Research Methodology

Used `ai-gateway-lab` to test concurrency levels (1, 3, 5, 10, 20) with 20 terms:

```bash
PARALLEL_TEST=1 pnpm lab
```

Test ran on 2025-12-29 against OpenAI `gpt-5-mini` via Cloudflare AI Gateway.

## Research Findings

### Performance Results

| Concurrency | Total Time | Avg Request | Speedup |
|-------------|------------|-------------|---------|
| 1           | 98,349ms   | 4,917ms     | 1x      |
| 3           | 9,950ms    | 4,116ms     | 10x     |
| 5           | 9,456ms    | 4,348ms     | 10x     |
| 10          | 10,327ms   | 4,737ms     | 10x     |
| 20          | 7,509ms    | 3,975ms     | 13x     |

### Key Observations

1. **No rate limit errors** at any concurrency level (0 errors across all tests)
2. **OpenAI Tier 1 limits** (500 req/min, 500k tokens/min) are well above our needs
3. **Diminishing returns** after concurrency=3 for 20 terms (~10x speedup plateau)
4. **Maximum parallelism** (concurrency=20) achieves 13x speedup
5. **LLM response time** averages 4 seconds regardless of concurrency

### Rate Limit Headroom

- OpenAI Tier 1: 500 requests/minute = ~8 requests/second
- Our usage: 20 requests in 7.5 seconds = ~2.7 requests/second
- Headroom: 3x capacity available

## Decision

Implement parallel suggestion generation with:

1. **Concurrency limit: 10** (conservative choice with 10x speedup)
2. **Use `Promise.allSettled`** for error isolation (partial failures don't abort batch)
3. **Preserve SSE streaming** - emit events as each request completes (out-of-order OK)
4. **No explicit rate limiting** - OpenAI Tier 1 limits provide sufficient headroom

### Why concurrency=10, not 20?

- 10 vs 20 concurrency difference is minimal (10s vs 7.5s for 20 terms)
- Lower concurrency reduces risk of hitting limits during traffic spikes
- Easier to increase later than to debug rate limit issues

## Implementation Plan

**File**: `packages/api/src/features/suggestions/usecases/generateSuggestions.ts`

```typescript
// Current: sequential for loop
for (const cand of candidatesToProcess) {
  const suggestion = await llm.suggestOne(term);
  yield { type: 'candidate', ... };
}

// New: parallel with concurrency limit
const CONCURRENCY_LIMIT = 10;
const results = await withConcurrencyLimit(
  candidatesToProcess.map(cand => async () => {
    const suggestion = await llm.suggestOne(cand.term);
    return { cand, suggestion };
  }),
  CONCURRENCY_LIMIT
);
```

**Changes required**:
1. Add concurrency limiter utility (no external dependency needed)
2. Update `generateSuggestions` to process in parallel
3. Emit SSE events as results arrive (maintain streaming UX)
4. Handle partial failures gracefully

## Consequences

### Positive
- 10x faster batch processing (100s → 10s for 20 terms)
- Improved user experience during suggestion generation
- No additional infrastructure required

### Negative
- Results arrive out-of-order (UI must handle this)
- Partial failures possible (some terms succeed, others fail)
- Slightly higher instantaneous API cost (parallel billing)

### Mitigations
- UI already handles incremental updates via SSE
- `Promise.allSettled` ensures all results are captured
- D1 caching reduces repeated API calls for same terms

## Alternatives Considered

1. **Keep sequential processing**: Safe but too slow for good UX
2. **Use Cloudflare Queues**: Adds complexity, not needed for this scale
3. **Batch API (OpenAI)**: Not supported for chat completions with structured output
4. **Higher concurrency (20)**: Marginal benefit, higher risk

## References

- Test results: `packages/ai-gateway-lab/.parallel-test-results.json`
- Test code: `packages/ai-gateway-lab/src/parallel-test.ts`
- OpenAI rate limits: https://platform.openai.com/docs/guides/rate-limits
