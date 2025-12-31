/**
 * LLM adapter using Vercel AI SDK with Cloudflare AI Gateway.
 *
 * This adapter uses ai-gateway-provider to route OpenAI requests through
 * Cloudflare AI Gateway for centralized observability and billing.
 */

import { valibotSchema } from '@ai-sdk/valibot';
import { generateText, Output } from 'ai';
import { createAiGateway } from 'ai-gateway-provider';
import { createOpenAI } from 'ai-gateway-provider/providers/openai';
import { maxLength, picklist, pipe, strictObject, string } from 'valibot';
import type { BucketInfo, LlmClient, Suggestion } from '../ports/llm';

/**
 * Configuration for AI Gateway LLM client.
 */
export interface AIGatewayConfig {
	accountId: string;
	gatewayId: string;
	gatewayToken?: string;
	openaiApiKey: string;
}

/**
 * Build a dynamic system prompt based on user's buckets.
 */
function buildSystemPrompt(buckets: BucketInfo[]): string {
	const bucketList = buckets.map((b) => b.slug).join(', ');
	const bucketDefs = buckets.map((b) => `- ${b.slug}: ${b.description}`).join('\n');

	return `You are a concise technical glossary assistant for a software engineer's personal learning log.

Given a technical term or concept, respond with:
1. A one-liner explanation (1-2 sentences max, practical and memorable)
2. A bucket classification from exactly one of: ${bucketList}

Bucket definitions:
${bucketDefs}

Response format (JSON):
{"bucket": "<bucket-slug>", "text": "<one-liner explanation>"}

Guidelines:
- Be practical, not academic—explain like a senior engineer would to a peer
- Prefer concrete examples over abstract definitions when helpful
- Keep it under 200 characters for the one-liner
- Only output valid JSON, nothing else`;
}

/**
 * Build a valibot schema for LLM output validation with dynamic bucket list.
 */
function buildSuggestionSchema(buckets: BucketInfo[]) {
	const slugs = buckets.map((b) => b.slug);
	return strictObject({
		bucket: picklist(slugs as [string, ...string[]], 'Invalid bucket'),
		text: pipe(string(), maxLength(500)),
	});
}

/**
 * Default model for suggestions.
 */
export const SUGGESTION_MODEL = 'gpt-5-mini' as const;

/**
 * Prompt version for cache invalidation.
 * Increment when prompt logic changes significantly.
 */
export const PROMPT_VERSION = 2;

/**
 * Create an LLM client using Cloudflare AI Gateway.
 */
export function makeLlmClient(config: AIGatewayConfig): LlmClient {
	const aigateway = createAiGateway({
		accountId: config.accountId,
		gateway: config.gatewayId,
		apiKey: config.gatewayToken,
	});

	const openai = createOpenAI({
		apiKey: config.openaiApiKey,
	});

	return {
		async suggestOne(term: string, buckets: BucketInfo[]): Promise<Suggestion> {
			const systemPrompt = buildSystemPrompt(buckets);
			const suggestionSchema = buildSuggestionSchema(buckets);

			const response = await generateText({
				system: systemPrompt,
				model: aigateway(openai.chat(SUGGESTION_MODEL)),
				prompt: term,
				output: Output.object({
					schema: valibotSchema(suggestionSchema),
				}),
			});

			// Type assertion is safe because valibot validates the schema
			return response.output as Suggestion;
		},
	};
}
