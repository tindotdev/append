/**
 * Stub LLM adapter for testing.
 *
 * Generates deterministic suggestions based on the input term hash.
 * Use this adapter in tests and local development without LLM costs.
 */

import { BUCKETS, type Bucket } from '@append/contracts/types';
import type { LlmClient, Suggestion } from '../ports/llm';

/**
 * Simple hash function for deterministic bucket selection.
 */
function simpleHash(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash);
}

/**
 * Generate a deterministic suggestion for a term.
 *
 * @param normalizedTerm - The normalized term to generate a suggestion for
 * @returns A deterministic suggestion based on the term hash
 */
export function generateStubSuggestion(normalizedTerm: string): Suggestion {
	const bucketIndex = simpleHash(normalizedTerm) % BUCKETS.length;
	const bucket: Bucket = BUCKETS[bucketIndex];
	const text = `One-liner for: ${normalizedTerm}`;

	return { bucket, text };
}

/**
 * Create a stub LLM client for testing.
 */
export function makeStubLlmClient(): LlmClient {
	return {
		async suggestOne(term: string): Promise<Suggestion> {
			// Normalize the term for consistent results
			const normalized = term.trim().toLowerCase().replace(/\s+/g, ' ');
			return generateStubSuggestion(normalized);
		},
	};
}
