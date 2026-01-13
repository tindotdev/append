/**
 * Valibot schema for POST /api/term/:id/restore request body.
 */

import * as v from 'valibot';

/**
 * Schema for restore term request body.
 *
 * Requires:
 * - expectedVersion: integer for optimistic locking
 */
export const RestoreTermSchema = v.object({
	expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
});

/**
 * Type for validated restore term input.
 */
export type RestoreTermInput = v.InferOutput<typeof RestoreTermSchema>;
