/**
 * Use case: Update a term's displayTerm with optimistic locking.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term } from '../../../db';
import { resolveOptimisticConflict } from '../../../shared/optimistic';
import type { UpdateTermInput } from '../validation/updateTerm.schema';

/**
 * Term result from update.
 */
export interface TermResult {
	id: string;
	displayTerm: string;
	canonical: string;
	version: number;
	createdAt: number;
}

/**
 * Possible errors from updateTerm.
 */
export type UpdateTermError = { type: 'not_found' } | { type: 'forbidden' } | { type: 'version_conflict'; currentVersion: number };

/**
 * Update a term's displayTerm with optimistic locking.
 */
export async function updateTerm(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	termId: string,
	input: UpdateTermInput
): Promise<{ success: true; result: TermResult } | { success: false; error: UpdateTermError }> {
	const { expectedVersion, displayTerm } = input;

	// 1. Lookup term and verify ownership
	const termRow = await db.query.term.findFirst({
		where: and(eq(term.id, termId), isNull(term.archivedAt)),
	});

	if (!termRow) {
		return { success: false, error: { type: 'not_found' } };
	}

	// 2. Verify ownership
	if (termRow.userId !== userId) {
		return { success: false, error: { type: 'forbidden' } };
	}

	// 3. Atomic conditional update with optimistic locking
	const updateResult = await db
		.update(term)
		.set({
			displayTerm,
			version: sql`${term.version} + 1`,
		})
		.where(sql`${term.id} = ${termId} AND ${term.version} = ${expectedVersion}`)
		.returning({
			id: term.id,
			displayTerm: term.displayTerm,
			canonical: term.canonical,
			version: term.version,
			createdAt: term.createdAt,
		});

	// 4. Handle conflict or success
	if (updateResult.length === 0) {
		const conflict = await resolveOptimisticConflict(
			() =>
				db.query.term.findFirst({
					where: eq(term.id, termId),
				}),
			(currentTerm) => currentTerm.version
		);

		if (conflict.status === 'not_found') {
			// Term was deleted between check and update
			return { success: false, error: { type: 'not_found' } };
		}

		// Version conflict
		return { success: false, error: { type: 'version_conflict', currentVersion: conflict.currentVersion } };
	}

	// Success - return updated term
	const updated = updateResult[0];

	return {
		success: true,
		result: {
			id: updated.id,
			displayTerm: updated.displayTerm,
			canonical: updated.canonical,
			version: updated.version,
			createdAt: updated.createdAt.getTime(),
		},
	};
}
