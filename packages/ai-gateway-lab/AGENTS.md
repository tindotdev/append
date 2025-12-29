# AGENTS.md — packages/ai-gateway-lab

## Purpose

- Local lab for testing Cloudflare AI Gateway + LLM providers
- Use Vercel `ai` sdk with valibot structured output

## Commands

- `pnpm lab` — single term test (default: "Cloudflare")
- `BATCH_MODE=1 pnpm lab` — batch test 20 terms with SSE-style events
- `PARALLEL_TEST=1 pnpm lab` — test concurrency levels (1, 3, 5, 10, 20) for rate limit research
- `pnpm typecheck`

## Module Structure

| File | Purpose |
|------|---------|
| `index.ts` | Entry point, routes to single/batch/parallel mode |
| `suggest-one.ts` | Core LLM call (single term) |
| `batch-processor.ts` | Async generator for batch processing |
| `batch-events.ts` | Event type definitions (start/candidate/done) |
| `parallel-test.ts` | Parallel request testing for rate limit research |
| `terms.ts` | 20 test terms covering all 5 buckets |
| `system-prompt.ts` | LLM system prompt |
| `gateway.ts` | AI Gateway + OpenAI provider setup |
| `cache.ts` | Filesystem cache for LLM responses |
