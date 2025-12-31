/**
 * Use case: Update a candidate's chosen bucket/text with optimistic locking.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket, candidate, type schema } from '../../../db';
import { requireBatchOwned } from '../../../shared/queries';
import type { UpdateCandidateInput } from '../validation/updateCandidate.schema';

/**
 * Candidate returned from update.
 */
export interface CandidateResult {
	id: string;
	position: number;
	term: string;
	normalizedTerm: string;
	status: string;
	chosenBucket: string | null;
	chosenText: string | null;
	suggestedBucket: string | null;
	suggestedText: string | null;
	suggestionStatus: string | null;
	suggestionError: string | null;
	suggestionAttempts: number;
	version: number;
	materializedTermId: string | null;
	materializedTermSenseId: string | null;
	createdAt: number;
	updatedAt: number;
}

/**
 * Possible errors from updateCandidate.
 */
export type UpdateCandidateError =
	| { type: 'not_found' }
	| { type: 'forbidden' }
	| { type: 'invalid_bucket'; slug: string }
	| { type: 'version_conflict'; currentVersion: number };

/**
 * Update a candidate's chosen bucket/text with optimistic locking.
 */
export async function updateCandidate(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	candidateId: string,
	input: UpdateCandidateInput
): Promise<{ success: true; result: CandidateResult } | { success: false; error: UpdateCandidateError }> {
	const { expectedVersion, chosenBucket, chosenText } = input;

	// 1. Lookup candidate and verify ownership
	const candidateRow = await db.query.candidate.findFirst({
		where: eq(candidate.id, candidateId),
	});

	if (!candidateRow) {
		return { success: false, error: { type: 'not_found' } };
	}

	// Lookup batch to verify ownership
	const batchOwnership = await requireBatchOwned(db, userId, candidateRow.batchId);
	if (!batchOwnership.ok) {
		return { success: false, error: { type: batchOwnership.error } };
	}

	// 2. Validate bucket exists for user (if provided)
	if (chosenBucket) {
		const bucketRow = await db.query.bucket.findFirst({
			where: and(eq(bucket.userId, userId), eq(bucket.slug, chosenBucket)),
			columns: { id: true },
		});

		if (!bucketRow) {
			return { success: false, error: { type: 'invalid_bucket', slug: chosenBucket } };
		}
	}

	// 4. Build update set (partial update semantics)
	const updateSet: Record<string, unknown> = {
		version: sql`${candidate.version} + 1`,
		updatedAt: new Date(),
	};

	if (chosenBucket !== undefined) {
		updateSet.chosenBucket = chosenBucket;
	}
	if (chosenText !== undefined) {
		updateSet.chosenText = chosenText;
	}

	// 5. Atomic conditional update with optimistic locking
	const updateResult = await db
		.update(candidate)
		.set(updateSet)
		.where(sql`${candidate.id} = ${candidateId} AND ${candidate.version} = ${expectedVersion}`)
		.returning({
			id: candidate.id,
			position: candidate.position,
			term: candidate.term,
			normalizedTerm: candidate.normalizedTerm,
			status: candidate.status,
			chosenBucket: candidate.chosenBucket,
			chosenText: candidate.chosenText,
			suggestedBucket: candidate.suggestedBucket,
			suggestedText: candidate.suggestedText,
			suggestionStatus: candidate.suggestionStatus,
			suggestionError: candidate.suggestionError,
			suggestionAttempts: candidate.suggestionAttempts,
			version: candidate.version,
			materializedTermId: candidate.materializedTermId,
			materializedTermSenseId: candidate.materializedTermSenseId,
			createdAt: candidate.createdAt,
			updatedAt: candidate.updatedAt,
		});

	// 6. Handle conflict or success
	if (updateResult.length === 0) {
		// Re-SELECT to get current version
		const currentCandidate = await db.query.candidate.findFirst({
			where: eq(candidate.id, candidateId),
		});

		if (!currentCandidate) {
			// Candidate was deleted between check and update
			return { success: false, error: { type: 'not_found' } };
		}

		// Version conflict
		return { success: false, error: { type: 'version_conflict', currentVersion: currentCandidate.version } };
	}

	// Success - return updated candidate
	const updated = updateResult[0];

	return {
		success: true,
		result: {
			id: updated.id,
			position: updated.position,
			term: updated.term,
			normalizedTerm: updated.normalizedTerm,
			status: updated.status,
			chosenBucket: updated.chosenBucket,
			chosenText: updated.chosenText,
			suggestedBucket: updated.suggestedBucket,
			suggestedText: updated.suggestedText,
			suggestionStatus: updated.suggestionStatus,
			suggestionError: updated.suggestionError,
			suggestionAttempts: updated.suggestionAttempts,
			version: updated.version,
			materializedTermId: updated.materializedTermId,
			materializedTermSenseId: updated.materializedTermSenseId,
			createdAt: updated.createdAt.getTime(),
			updatedAt: updated.updatedAt.getTime(),
		},
	};
}
