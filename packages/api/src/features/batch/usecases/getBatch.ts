/**
 * Use case: Get a batch by ID.
 *
 * Returns the batch with all its candidates.
 */

import type { Bucket } from '@append/contracts/types';
import { asc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type BatchStatus, batch, candidate, type SuggestionStatus, type schema } from '../../../db';

/**
 * Candidate detail for get batch response.
 */
export interface CandidateDetail {
	id: string;
	position: number;
	term: string;
	normalizedTerm: string;
	status: BatchStatus;
	chosenBucket: Bucket | null;
	chosenText: string | null;
	suggestedBucket: Bucket | null;
	suggestedText: string | null;
	suggestionStatus: SuggestionStatus | null;
	suggestionError: string | null;
	suggestionAttempts: number;
	version: number;
	materializedTermId: string | null;
	materializedTermSenseId: string | null;
	createdAt: number;
	updatedAt: number;
}

/**
 * Batch detail for get batch response.
 */
export interface BatchDetail {
	id: string;
	status: BatchStatus;
	createdAt: number;
	updatedAt: number;
	candidateCount: number;
	candidates: CandidateDetail[];
}

/**
 * Error types for get batch.
 */
export type GetBatchError = { type: 'not_found' } | { type: 'forbidden' };

/**
 * Get a batch by ID with all its candidates.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID
 * @param batchId - Batch ID
 * @returns Batch detail or error
 */
export async function getBatch(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	batchId: string
): Promise<{ success: true; result: BatchDetail } | { success: false; error: GetBatchError }> {
	// Lookup batch by id
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
	});

	// 404 if missing
	if (!batchRow) {
		return { success: false, error: { type: 'not_found' } };
	}

	// 403 if not owner
	if (batchRow.userId !== userId) {
		return { success: false, error: { type: 'forbidden' } };
	}

	// Get candidates ordered by position
	const candidates = await db
		.select({
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
		})
		.from(candidate)
		.where(eq(candidate.batchId, batchId))
		.orderBy(asc(candidate.position));

	return {
		success: true,
		result: {
			id: batchRow.id,
			status: batchRow.status,
			createdAt: batchRow.createdAt.getTime(),
			updatedAt: batchRow.updatedAt.getTime(),
			candidateCount: candidates.length,
			candidates: candidates.map((cand) => ({
				id: cand.id,
				position: cand.position,
				term: cand.term,
				normalizedTerm: cand.normalizedTerm,
				status: cand.status,
				chosenBucket: cand.chosenBucket,
				chosenText: cand.chosenText,
				suggestedBucket: cand.suggestedBucket,
				suggestedText: cand.suggestedText,
				suggestionStatus: cand.suggestionStatus,
				suggestionError: cand.suggestionError,
				suggestionAttempts: cand.suggestionAttempts,
				version: cand.version,
				materializedTermId: cand.materializedTermId,
				materializedTermSenseId: cand.materializedTermSenseId,
				createdAt: cand.createdAt.getTime(),
				updatedAt: cand.updatedAt.getTime(),
			})),
		},
	};
}
