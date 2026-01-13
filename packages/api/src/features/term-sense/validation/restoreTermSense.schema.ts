/**
 * Valibot schema for POST /api/term-sense/:id/restore request body.
 */

import * as v from 'valibot';

/**
 * Schema for restore term sense request body.
 *
 * Requires:
 * - expectedVersion: integer for optimistic locking
 */
export const RestoreTermSenseSchema = v.object({
	expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
});

/**
 * Type for validated restore term sense input.
 */
export type RestoreTermSenseInput = v.InferOutput<typeof RestoreTermSenseSchema>;
