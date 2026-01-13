/**
 * Valibot schema for POST /api/term-sense/:id/archive request body.
 */

import * as v from 'valibot';

/**
 * Schema for archive term sense request body.
 *
 * Requires:
 * - expectedVersion: integer for optimistic locking
 */
export const ArchiveTermSenseSchema = v.object({
	expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
});

/**
 * Type for validated archive term sense input.
 */
export type ArchiveTermSenseInput = v.InferOutput<typeof ArchiveTermSenseSchema>;
