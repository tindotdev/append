/**
 * Valibot schema for POST /api/term/:id/archive request body.
 */

import * as v from 'valibot';

/**
 * Schema for archive term request body.
 *
 * Requires:
 * - expectedVersion: integer for optimistic locking
 */
export const ArchiveTermSchema = v.object({
	expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
});

/**
 * Type for validated archive term input.
 */
export type ArchiveTermInput = v.InferOutput<typeof ArchiveTermSchema>;
