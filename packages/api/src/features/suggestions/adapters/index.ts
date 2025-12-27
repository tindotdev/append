/**
 * LLM adapter factory.
 *
 * Creates the appropriate LLM client based on the configured provider.
 */

import type { Bindings } from '../../../platform/env';
import type { LlmClient, SuggestionProvider } from '../ports/llm';
import { makeLlmClient as makeAIGatewayClient } from './llm.aigateway';
import { makeStubLlmClient } from './llm.stub';

/**
 * Create an LLM client based on environment configuration.
 *
 * @param env - Cloudflare Worker bindings
 * @returns LLM client instance, or null if suggestions are disabled
 * @throws Error if provider is 'openai' but required config is missing
 */
export function createLlmClient(env: Bindings): LlmClient | null {
	const provider = (env.SUGGESTIONS_PROVIDER || 'stub') as SuggestionProvider;

	switch (provider) {
		case 'disabled':
			return null;

		case 'stub':
			return makeStubLlmClient();

		case 'openai': {
			if (!env.CF_ACCOUNT_ID || !env.AI_GATEWAY_ID || !env.CF_AIG_TOKEN) {
				throw new Error('OpenAI provider requires CF_ACCOUNT_ID, AI_GATEWAY_ID, and CF_AIG_TOKEN');
			}

			return makeAIGatewayClient({
				accountId: env.CF_ACCOUNT_ID,
				gatewayId: env.AI_GATEWAY_ID,
				apiKey: env.CF_AIG_TOKEN,
			});
		}

		default:
			throw new Error(`Unknown suggestion provider: ${provider}`);
	}
}

export { SUGGESTION_MODEL, PROMPT_VERSION } from './llm.aigateway';
export { generateStubSuggestion } from './llm.stub';
