/**
 * Valibot schema for POST /api/batch/:id/suggest query parameters.
 */

import * as v from 'valibot';

/**
 * Constants for suggestion limits.
 */
export const DEFAULT_LIMIT = 50;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 200;
export const MAX_SUGGESTION_ATTEMPTS = 3;

/**
 * Suggestion mode.
 */
export type SuggestionMode = 'fill-missing' | 'regenerate';

/**
 * Schema for suggest query parameters.
 */
export const SuggestSchema = v.object({
	limit: v.optional(
		v.pipe(
			v.string(),
			v.transform((s) => parseInt(s, 10)),
			v.number(),
			v.integer(),
			v.minValue(MIN_LIMIT, `limit must be at least ${MIN_LIMIT}`),
			v.maxValue(MAX_LIMIT, `limit must be at most ${MAX_LIMIT}`)
		),
		String(DEFAULT_LIMIT)
	),
	regenerate: v.optional(
		v.pipe(
			v.string(),
			v.transform((s) => s === '1')
		),
		'false'
	),
});

/**
 * Type for validated suggest query.
 */
export type SuggestInput = v.InferOutput<typeof SuggestSchema>;
