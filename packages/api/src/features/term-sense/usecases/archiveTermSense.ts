/**
 * Use case: Archive a term sense with optimistic locking and primary replacement.
 */

import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term, termSense } from '../../../db';
import { resolveOptimisticConflict, toOptimisticError } from '../../../shared/optimistic';
import { requireTermOwnedIncludingArchived } from '../../../shared/queries';
import type { ArchiveTermSenseInput } from '../validation/archiveTermSense.schema';

/**
 * Result shape for archive term sense response.
 */
export interface ArchiveTermSenseResult {
	sense: {
		id: string;
		termId: string;
		version: number;
		archivedAt: number;
	};
	term?: {
		id: string;
		primarySenseId: string | null;
		version: number;
		archivedAt: number | null;
	};
	noop?: boolean;
}

/**
 * Possible errors from archiveTermSense.
 */
export type ArchiveTermSenseError =
	| { type: 'not_found' }
	| { type: 'forbidden' }
	| { type: 'version_conflict'; currentVersion: number }
	| { type: 'term_version_conflict'; currentVersion: number };

/**
 * Find a replacement primary sense when archiving the current primary.
 *
 * Rules (deterministic):
 * 1. Prefer newest non-archived sense in the same bucket
 * 2. Else pick newest non-archived sense in any bucket
 * 3. Else return null (no remaining senses)
 */
async function findReplacementPrimarySense(
	db: DrizzleD1Database<typeof schema>,
	termId: string,
	archivedSenseId: string,
	currentBucket: string
): Promise<string | null> {
	// Rule 1: Prefer newest non-archived sense in same bucket
	const sameBucket = await db.query.termSense.findFirst({
		where: and(
			eq(termSense.termId, termId),
			eq(termSense.bucket, currentBucket),
			isNull(termSense.archivedAt),
			ne(termSense.id, archivedSenseId)
		),
		orderBy: [desc(termSense.createdAt)],
		columns: { id: true },
	});
	if (sameBucket) return sameBucket.id;

	// Rule 2: Else pick newest non-archived sense in any bucket
	const anyBucket = await db.query.termSense.findFirst({
		where: and(eq(termSense.termId, termId), isNull(termSense.archivedAt), ne(termSense.id, archivedSenseId)),
		orderBy: [desc(termSense.createdAt)],
		columns: { id: true },
	});
	if (anyBucket) return anyBucket.id;

	// Rule 3: No remaining senses
	return null;
}

/**
 * Archive a term sense with optimistic locking.
 *
 * Behavior:
 * - If already archived, returns { noop: true, sense: {...} }
 * - Archives the sense (archivedAt = now, version++)
 * - If this was the primary sense:
 *   - Finds a replacement primary sense (deterministic rules)
 *   - Updates term.primarySenseId (conditional on it still pointing to archived sense)
 *   - If no replacement exists, archives the term too
 */
export async function archiveTermSense(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	senseId: string,
	input: ArchiveTermSenseInput
): Promise<{ success: true; result: ArchiveTermSenseResult } | { success: false; error: ArchiveTermSenseError }> {
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

	// 3. If already archived, return noop
	if (senseRow.archivedAt !== null) {
		return {
			success: true,
			result: {
				sense: {
					id: senseRow.id,
					termId: senseRow.termId,
					version: senseRow.version,
					archivedAt: senseRow.archivedAt.getTime(),
				},
				noop: true,
			},
		};
	}

	// 4. Guard: verify term version compatibility BEFORE archiving the sense
	// This prevents partial writes where the sense is archived but term update fails
	const wasPrimary = termRow.primarySenseId === senseId;
	if (wasPrimary) {
		// Check if term has been modified since we read it
		const currentTermCheck = await db.query.term.findFirst({
			where: eq(term.id, termRow.id),
			columns: { version: true, primarySenseId: true },
		});

		if (!currentTermCheck || currentTermCheck.version !== termRow.version || currentTermCheck.primarySenseId !== senseId) {
			// Term was concurrently modified - fail before archiving the sense
			return {
				success: false,
				error: { type: 'term_version_conflict', currentVersion: currentTermCheck?.version ?? termRow.version },
			};
		}
	}

	// 5. Atomic conditional update with optimistic locking
	const now = new Date();

	const updateResult = await db
		.update(termSense)
		.set({
			archivedAt: now,
			version: sql`${termSense.version} + 1`,
		})
		.where(sql`${termSense.id} = ${senseId} AND ${termSense.version} = ${expectedVersion}`)
		.returning({
			id: termSense.id,
			termId: termSense.termId,
			version: termSense.version,
			archivedAt: termSense.archivedAt,
		});

	// 6. Handle conflict or success
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
	let termResult: ArchiveTermSenseResult['term'] | undefined;

	// 7. Handle primary sense replacement (term version already verified in step 4)

	if (wasPrimary) {
		// Find a replacement primary sense
		const replacementId = await findReplacementPrimarySense(db, termRow.id, senseId, senseRow.bucket);

		if (replacementId !== null) {
			// Update term's primarySenseId (conditional on primarySenseId to prevent race)
			// Note: term version was already verified in step 4, so this should not fail
			const termUpdateResult = await db
				.update(term)
				.set({
					primarySenseId: replacementId,
					version: sql`${term.version} + 1`,
				})
				.where(sql`${term.id} = ${termRow.id} AND ${term.primarySenseId} = ${senseId} AND ${term.version} = ${termRow.version}`)
				.returning({
					id: term.id,
					primarySenseId: term.primarySenseId,
					version: term.version,
					archivedAt: term.archivedAt,
				});

			// This should not happen due to step 4 guard, but handle defensively
			if (termUpdateResult.length === 0) {
				throw new Error('Unexpected: term update failed despite version guard');
			}

			const updatedTerm = termUpdateResult[0];
			termResult = {
				id: updatedTerm.id,
				primarySenseId: updatedTerm.primarySenseId,
				version: updatedTerm.version,
				archivedAt: updatedTerm.archivedAt?.getTime() ?? null,
			};
		} else {
			// No replacement exists - archive the term too
			// Note: term version was already verified in step 4, so this should not fail
			const termArchiveResult = await db
				.update(term)
				.set({
					archivedAt: now,
					version: sql`${term.version} + 1`,
				})
				.where(sql`${term.id} = ${termRow.id} AND ${term.primarySenseId} = ${senseId} AND ${term.version} = ${termRow.version}`)
				.returning({
					id: term.id,
					primarySenseId: term.primarySenseId,
					version: term.version,
					archivedAt: term.archivedAt,
				});

			// This should not happen due to step 4 guard, but handle defensively
			if (termArchiveResult.length === 0) {
				throw new Error('Unexpected: term archive failed despite version guard');
			}

			const archivedTerm = termArchiveResult[0];
			termResult = {
				id: archivedTerm.id,
				primarySenseId: archivedTerm.primarySenseId,
				version: archivedTerm.version,
				archivedAt: archivedTerm.archivedAt?.getTime() ?? null,
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
				archivedAt: updatedSense.archivedAt!.getTime(),
			},
			...(termResult && { term: termResult }),
		},
	};
}
