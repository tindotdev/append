/**
 * Use case: Update a term's displayTerm with optimistic locking.
 */

import { eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term } from '../../../db';
import { incrementVersion, resolveOptimisticConflict, toOptimisticError } from '../../../shared/optimistic';
import { requireTermOwned } from '../../../shared/queries';
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
	const termOwnership = await requireTermOwned(db, userId, termId);
	if (!termOwnership.ok) {
		return { success: false, error: { type: termOwnership.error } };
	}

	// 3. Atomic conditional update with optimistic locking
	const updateResult = await db
		.update(term)
		.set({
			displayTerm,
			version: incrementVersion(term),
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
		return { success: false, error: toOptimisticError(conflict) };
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
