/**
 * Use case: Restore a term and all its senses with optimistic locking.
 */

import { eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term, termSense } from '../../../db';
import { incrementVersion, resolveOptimisticConflict, toOptimisticError } from '../../../shared/optimistic';
import { requireTermOwnedIncludingArchived } from '../../../shared/queries';
import type { RestoreTermInput } from '../validation/restoreTerm.schema';

/**
 * Result shape for restore term response.
 */
export interface RestoreTermResult {
	term: {
		id: string;
		version: number;
		archivedAt: null;
	};
	noop?: boolean;
}

/**
 * Possible errors from restoreTerm.
 */
export type RestoreTermError = { type: 'not_found' } | { type: 'forbidden' } | { type: 'version_conflict'; currentVersion: number };

/**
 * Restore a term and all its senses with optimistic locking.
 *
 * Behavior:
 * - If not archived, returns { noop: true, term: {...} }
 * - Restores the term (archivedAt = null, version++)
 * - Restores all senses for the term (archivedAt = null, version++)
 */
export async function restoreTerm(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	termId: string,
	input: RestoreTermInput
): Promise<{ success: true; result: RestoreTermResult } | { success: false; error: RestoreTermError }> {
	const { expectedVersion } = input;

	// 1. Lookup term and verify ownership (including archived terms)
	const termOwnership = await requireTermOwnedIncludingArchived(db, userId, termId);
	if (!termOwnership.ok) {
		return { success: false, error: { type: termOwnership.error } };
	}

	const termRow = termOwnership.value;

	// 2. If not archived, return noop
	if (termRow.archivedAt === null) {
		return {
			success: true,
			result: {
				term: {
					id: termRow.id,
					version: termRow.version,
					archivedAt: null,
				},
				noop: true,
			},
		};
	}

	// 3. Atomic conditional update with optimistic locking
	const updateResult = await db
		.update(term)
		.set({
			archivedAt: null,
			version: incrementVersion(term),
		})
		.where(sql`${term.id} = ${termId} AND ${term.version} = ${expectedVersion}`)
		.returning({
			id: term.id,
			version: term.version,
			archivedAt: term.archivedAt,
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

	// 5. Restore all senses for this term (best effort, term restore wins)
	await db
		.update(termSense)
		.set({
			archivedAt: null,
			version: incrementVersion(termSense),
		})
		.where(eq(termSense.termId, termId));

	// Success - return updated term
	const updated = updateResult[0];

	return {
		success: true,
		result: {
			term: {
				id: updated.id,
				version: updated.version,
				archivedAt: null,
			},
		},
	};
}
