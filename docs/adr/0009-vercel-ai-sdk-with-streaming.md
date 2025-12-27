# ADR 0009 — Vercel AI SDK with SSE Streaming for Suggestions

Status: Accepted
Date: 2025-12-27

Supersedes: ADR 0006 (partially — LLM SDK choice and streaming posture)

## Context

The current raw `fetch` implementation for LLM suggestions (per ADR 0006) has proven non-functional in production. Meanwhile, the experimental `ai-gateway-lab` package demonstrates a working pattern using:

- **Vercel AI SDK** (`ai` package) for LLM orchestration
- **ai-gateway-provider** for Cloudflare AI Gateway integration
- **valibot** schemas with `@ai-sdk/valibot` for structured output validation

Additionally, the current suggestion endpoint returns a complete JSON response after processing all candidates. For batches with 50+ terms, this creates a poor UX with no progress feedback.

## Decision

### LLM SDK

Adopt **Vercel AI SDK** as the primary LLM interface:

```typescript
import { generateText, Output } from 'ai';
import { valibotSchema } from '@ai-sdk/valibot';
import { createAiGateway } from 'ai-gateway-provider';
import { createOpenAI } from 'ai-gateway-provider/providers/openai';

const aigateway = createAiGateway({
  accountId: env.CF_ACCOUNT_ID,
  gateway: env.AI_GATEWAY_ID,
  apiKey: env.CF_AIG_TOKEN,
});

const openai = createOpenAI();

const response = await generateText({
  model: aigateway(openai.chat('gpt-5-mini')),
  system: SYSTEM_PROMPT,
  prompt: term,
  output: Output.object({
    schema: valibotSchema(SuggestionSchema),
  }),
});
```

This replaces the raw `fetch` with `cf-aig-authorization` header from ADR 0006.

### Streaming for Progress Updates

Allow **SSE (Server-Sent Events) streaming** for the suggestion endpoint to provide real-time progress feedback:

```
POST /api/batch/:id/suggest
Content-Type: text/event-stream

event: start
data: {"batchId":"..."}

event: stats
data: {"total":50,"cached":10,"pending":40}

event: candidate
data: {"id":"...","term":"Docker","status":"running"}

event: candidate
data: {"id":"...","term":"Docker","status":"ok","suggestion":{"bucket":"dx-tooling","text":"..."}}

event: done
data: {"ok":38,"failed":2,"cached":10}
```

This does **not** stream the LLM response itself (the model call remains non-streaming). It streams the batch processing progress to the client.

### Configuration Changes

New environment variables:

- `CF_ACCOUNT_ID` — Cloudflare account ID (previously derived from AI binding)

Unchanged:

- `CF_AIG_TOKEN` — Cloudflare API token for Unified Billing
- `AI_GATEWAY_ID` — AI Gateway identifier
- Model: `gpt-5-mini` (unchanged from ADR 0006)

### Validation with Valibot

Use valibot schemas for:

1. **LLM output validation** (via `@ai-sdk/valibot`)
2. **Request validation** (replacing manual validation code)

This reduces ~60 lines of manual validation per endpoint to ~20 lines of schema definitions.

## Consequences

### Preserved from ADR 0006

- Provider: OpenAI
- Model: `gpt-5-mini`
- Request path: Worker → Cloudflare AI Gateway → OpenAI
- Centralized observability via AI Gateway
- Application-layer caching (per ADR 0007)

### Changed from ADR 0006

- SDK: Vercel AI SDK (was: raw fetch)
- Auth: `apiKey` via ai-gateway-provider (was: `cf-aig-authorization` header)
- URL: Constructed by ai-gateway-provider (was: `env.AI.gateway().getUrl()`)
- Response format: SSE stream with progress events (was: single JSON response)

### New Dependencies

```json
{
  "dependencies": {
    "ai": "^4.x",
    "@ai-sdk/valibot": "^1.x",
    "ai-gateway-provider": "^1.x",
    "valibot": "^1.x"
  }
}
```

### Benefits

- Working LLM integration (current code is non-functional)
- Real-time progress feedback for long-running suggestion batches
- Type-safe structured outputs via valibot schemas
- Reduced validation boilerplate
- Consistent pattern with ai-gateway-lab experiments

### Risks

- Additional dependencies (ai, ai-gateway-provider)
- SSE adds complexity (connection management, error handling mid-stream)
- `CF_ACCOUNT_ID` must be explicitly configured (not derived from AI binding)

## Alternatives Considered

1. **Fix raw fetch implementation**: Would require debugging auth/URL issues; doesn't address progress feedback need.
2. **Keep non-streaming but fix SDK**: Loses progress feedback benefit; users still wait with no feedback.
3. **WebSockets instead of SSE**: Over-engineered for one-way progress updates; SSE is simpler and HTTP-native.
