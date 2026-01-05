/**
 * Use case: Restore a term sense with optimistic locking.
 */

import { eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term, termSense } from '../../../db';
import { resolveOptimisticConflict, toOptimisticError } from '../../../shared/optimistic';
import { requireTermOwnedIncludingArchived } from '../../../shared/queries';
import type { RestoreTermSenseInput } from '../validation/restoreTermSense.schema';

/**
 * Result shape for restore term sense response.
 */
export interface RestoreTermSenseResult {
	sense: {
		id: string;
		termId: string;
		version: number;
		archivedAt: null;
	};
	term?: {
		id: string;
		primarySenseId: string | null;
		version: number;
		archivedAt: null;
	};
	noop?: boolean;
}

/**
 * Possible errors from restoreTermSense.
 */
export type RestoreTermSenseError = { type: 'not_found' } | { type: 'forbidden' } | { type: 'version_conflict'; currentVersion: number };

/**
 * Restore a term sense with optimistic locking.
 *
 * Behavior:
 * - If not archived, returns { noop: true, sense: {...} }
 * - Restores the sense (archivedAt = null, version++)
 * - If parent term is archived, restores it too (archivedAt = null, version++)
 */
export async function restoreTermSense(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	senseId: string,
	input: RestoreTermSenseInput
): Promise<{ success: true; result: RestoreTermSenseResult } | { success: false; error: RestoreTermSenseError }> {
	const { expectedVersion } = input;

	// 1. Lookup sense (including archived)
	const senseRow = await db.query.termSense.findFirst({
		where: eq(termSense.id, senseId),
	});

	if (!senseRow) {
		return { success: false, error: { type: 'not_found' } };
	}

	// 2. Lookup parent term and verify ownership (including archived terms)
	const termOwnership = await requireTermOwnedIncludingArchived(db, userId, senseRow.termId);
	if (!termOwnership.ok) {
		return { success: false, error: { type: termOwnership.error } };
	}

	const termRow = termOwnership.value;

	// 3. If not archived, return noop
	if (senseRow.archivedAt === null) {
		return {
			success: true,
			result: {
				sense: {
					id: senseRow.id,
					termId: senseRow.termId,
					version: senseRow.version,
					archivedAt: null,
				},
				noop: true,
			},
		};
	}

	// 4. Atomic conditional update with optimistic locking
	const updateResult = await db
		.update(termSense)
		.set({
			archivedAt: null,
			version: sql`${termSense.version} + 1`,
		})
		.where(sql`${termSense.id} = ${senseId} AND ${termSense.version} = ${expectedVersion}`)
		.returning({
			id: termSense.id,
			termId: termSense.termId,
			version: termSense.version,
			archivedAt: termSense.archivedAt,
		});

	// 5. Handle conflict or success
	if (updateResult.length === 0) {
		const conflict = await resolveOptimisticConflict(
			() =>
				db.query.termSense.findFirst({
					where: eq(termSense.id, senseId),
				}),
			(currentSense) => currentSense.version
		);
		return { success: false, error: toOptimisticError(conflict) };
	}

	const updatedSense = updateResult[0];
	let termResult: RestoreTermSenseResult['term'] | undefined;

	// 6. If parent term is archived, restore it too
	if (termRow.archivedAt !== null) {
		const termRestoreResult = await db
			.update(term)
			.set({
				archivedAt: null,
				version: sql`${term.version} + 1`,
			})
			.where(eq(term.id, termRow.id))
			.returning({
				id: term.id,
				primarySenseId: term.primarySenseId,
				version: term.version,
				archivedAt: term.archivedAt,
			});

		if (termRestoreResult.length > 0) {
			const restoredTerm = termRestoreResult[0];
			termResult = {
				id: restoredTerm.id,
				primarySenseId: restoredTerm.primarySenseId,
				version: restoredTerm.version,
				archivedAt: null,
			};
		}
	}

	// Success - return updated sense (and optionally term)
	return {
		success: true,
		result: {
			sense: {
				id: updatedSense.id,
				termId: updatedSense.termId,
				version: updatedSense.version,
				archivedAt: null,
			},
			...(termResult && { term: termResult }),
		},
	};
}
