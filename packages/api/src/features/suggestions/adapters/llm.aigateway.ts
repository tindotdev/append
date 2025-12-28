/**
 * LLM adapter using Vercel AI SDK with Cloudflare AI Gateway.
 *
 * This adapter uses ai-gateway-provider to route OpenAI requests through
 * Cloudflare AI Gateway for centralized observability and billing.
 */

import { valibotSchema } from '@ai-sdk/valibot';
import { BUCKET_LIST, BucketSchema } from '@append/contracts';
import { generateText, Output } from 'ai';
import { createAiGateway } from 'ai-gateway-provider';
import { createOpenAI } from 'ai-gateway-provider/providers/openai';
import { maxLength, pipe, strictObject, string } from 'valibot';
import type { LlmClient, Suggestion } from '../ports/llm';

/**
 * Configuration for AI Gateway LLM client.
 */
export interface AIGatewayConfig {
	accountId: string;
	gatewayId: string;
	apiKey: string;
}

/**
 * System prompt for suggestion generation (v1).
 */
const SYSTEM_PROMPT = `You are a concise technical glossary assistant for a software engineer's personal learning log.

Given a technical term or concept, respond with:
1. A one-liner explanation (1-2 sentences max, practical and memorable)
2. A bucket classification from exactly one of: ${BUCKET_LIST}

Bucket definitions:
- foundations: Core CS concepts, algorithms, data structures
- backend: Server-side patterns, APIs, databases, storage
- frontend: UI patterns, React, state management, conflict UX, accept workflows
- dx-tooling: Build tools, migrations, scripts, CI/CD, developer experience
- deep-concepts: Model Context Protocol, CAP theorem, system design philosophy

Response format (JSON):
{"bucket": "<bucket-slug>", "text": "<one-liner explanation>"}

Guidelines:
- Be practical, not academic—explain like a senior engineer would to a peer
- Prefer concrete examples over abstract definitions when helpful
- Keep it under 200 characters for the one-liner
- Only output valid JSON, nothing else`;

/**
 * Valibot schema for LLM output validation.
 */
const SuggestionSchema = strictObject({
	bucket: BucketSchema,
	text: pipe(string(), maxLength(500)),
});

/**
 * Default model for suggestions.
 */
export const SUGGESTION_MODEL = 'gpt-5-mini' as const;

/**
 * Prompt version for cache invalidation.
 */
export const PROMPT_VERSION = 1;

/**
 * Create an LLM client using Cloudflare AI Gateway.
 */
export function makeLlmClient(config: AIGatewayConfig): LlmClient {
	const aigateway = createAiGateway({
		accountId: config.accountId,
		gateway: config.gatewayId,
		apiKey: config.apiKey,
	});

	const openai = createOpenAI();

	return {
		async suggestOne(term: string): Promise<Suggestion> {
			const response = await generateText({
				system: SYSTEM_PROMPT,
				model: aigateway(openai.chat(SUGGESTION_MODEL)),
				prompt: term,
				output: Output.object({
					schema: valibotSchema(SuggestionSchema),
				}),
			});

			// Type assertion is safe because valibot validates the schema
			return response.output as Suggestion;
		},
	};
}
