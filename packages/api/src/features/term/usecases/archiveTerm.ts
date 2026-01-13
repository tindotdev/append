/**
 * Use case: Archive a term and all its active senses with optimistic locking.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term, termSense } from '../../../db';
import { resolveOptimisticConflict, toOptimisticError } from '../../../shared/optimistic';
import { requireTermOwnedIncludingArchived } from '../../../shared/queries';
import type { ArchiveTermInput } from '../validation/archiveTerm.schema';

/**
 * Result shape for archive term response.
 */
export interface ArchiveTermResult {
	term: {
		id: string;
		version: number;
		archivedAt: number;
	};
	noop?: boolean;
}

/**
 * Possible errors from archiveTerm.
 */
export type ArchiveTermError = { type: 'not_found' } | { type: 'forbidden' } | { type: 'version_conflict'; currentVersion: number };

/**
 * Archive a term and all its active senses with optimistic locking.
 *
 * Behavior:
 * - If already archived, returns { noop: true, term: {...} }
 * - Archives the term (archivedAt = now, version++)
 * - Archives all active senses for the term (archivedAt = now, version++)
 */
export async function archiveTerm(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	termId: string,
	input: ArchiveTermInput
): Promise<{ success: true; result: ArchiveTermResult } | { success: false; error: ArchiveTermError }> {
	const { expectedVersion } = input;

	// 1. Lookup term and verify ownership (including archived terms)
	const termOwnership = await requireTermOwnedIncludingArchived(db, userId, termId);
	if (!termOwnership.ok) {
		return { success: false, error: { type: termOwnership.error } };
	}

	const termRow = termOwnership.value;

	// 2. If already archived, return noop
	if (termRow.archivedAt !== null) {
		return {
			success: true,
			result: {
				term: {
					id: termRow.id,
					version: termRow.version,
					archivedAt: termRow.archivedAt.getTime(),
				},
				noop: true,
			},
		};
	}

	// 3. Atomic conditional update with optimistic locking
	const now = new Date();

	const updateResult = await db
		.update(term)
		.set({
			archivedAt: now,
			version: sql`${term.version} + 1`,
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

	// 5. Archive all active senses for this term (best effort, term archive wins)
	await db
		.update(termSense)
		.set({
			archivedAt: now,
			version: sql`${termSense.version} + 1`,
		})
		.where(and(eq(termSense.termId, termId), isNull(termSense.archivedAt)));

	// Success - return updated term
	const updated = updateResult[0];

	return {
		success: true,
		result: {
			term: {
				id: updated.id,
				version: updated.version,
				archivedAt: updated.archivedAt!.getTime(),
			},
		},
	};
}
