/**
 * Suggestion cache data access.
 *
 * Provides helpers for caching LLM suggestions in D1.
 */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, suggestionCache } from '../../../db';
import { generateUUID } from '../../../shared/crypto';
import type { Suggestion } from '../ports/llm';

/**
 * Check D1 cache for a suggestion.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID
 * @param normalizedTerm - Normalized term to lookup
 * @param model - Model name
 * @param promptVersion - Prompt version
 * @returns Cached suggestion or null
 */
export async function findCachedSuggestion(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	normalizedTerm: string,
	model: string,
	promptVersion: number
): Promise<Suggestion | null> {
	const [cached] = await db
		.select()
		.from(suggestionCache)
		.where(
			and(
				eq(suggestionCache.userId, userId),
				eq(suggestionCache.normalizedTerm, normalizedTerm),
				eq(suggestionCache.model, model),
				eq(suggestionCache.promptVersion, promptVersion)
			)
		)
		.limit(1);

	if (!cached) {
		return null;
	}

	return {
		bucket: cached.suggestedBucket,
		text: cached.suggestedText,
	};
}

/**
 * Save a suggestion to the D1 cache.
 *
 * Uses upsert to handle duplicate keys.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID
 * @param normalizedTerm - Normalized term
 * @param model - Model name
 * @param promptVersion - Prompt version
 * @param suggestion - Suggestion to cache
 */
export async function cacheSuggestion(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	normalizedTerm: string,
	model: string,
	promptVersion: number,
	suggestion: Suggestion
): Promise<void> {
	try {
		await db
			.insert(suggestionCache)
			.values({
				id: generateUUID(),
				userId,
				normalizedTerm,
				model,
				promptVersion,
				suggestedBucket: suggestion.bucket,
				suggestedText: suggestion.text,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [suggestionCache.userId, suggestionCache.normalizedTerm, suggestionCache.model, suggestionCache.promptVersion],
				set: {
					suggestedBucket: suggestion.bucket,
					suggestedText: suggestion.text,
					updatedAt: new Date(),
				},
			});
	} catch {
		// Cache upsert failure is non-fatal
	}
}
