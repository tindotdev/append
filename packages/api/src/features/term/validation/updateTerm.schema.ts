/**
 * Valibot schema for PATCH /api/term/:id request body.
 */

import * as v from 'valibot';

/**
 * Maximum length for display term.
 */
export const MAX_DISPLAY_TERM_LENGTH = 200;

/**
 * Schema for update term request body.
 *
 * Requires:
 * - expectedVersion: integer for optimistic locking
 * - displayTerm: string (1-200 chars, trimmed)
 */
export const UpdateTermSchema = v.object({
	expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
	displayTerm: v.pipe(
		v.string('displayTerm must be a string'),
		v.transform((s) => s.trim()),
		v.minLength(1, 'displayTerm cannot be empty'),
		v.maxLength(MAX_DISPLAY_TERM_LENGTH, `displayTerm must not exceed ${MAX_DISPLAY_TERM_LENGTH} characters`)
	),
});

/**
 * Type for validated update term input.
 */
export type UpdateTermInput = v.InferOutput<typeof UpdateTermSchema>;
