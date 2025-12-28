/**
 * Use case: List batches for a user.
 *
 * Returns paginated batches with candidate counts.
 */

import { and, count, eq, lt, or, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type BatchStatus, batch, candidate, type schema } from '../../../db';
import type { ListBatchesInput } from '../validation/listBatches.schema';
import { decodeCursor, encodeCursor } from '../validation/listBatches.schema';

/**
 * Batch summary for list response.
 */
export interface BatchSummary {
	id: string;
	status: BatchStatus;
	candidateCount: number;
	createdAt: number;
	updatedAt: number;
}

/**
 * Result of listing batches.
 */
export interface ListBatchesResult {
	batches: BatchSummary[];
	nextCursor: string | null;
}

/**
 * List batches for a user with pagination.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID
 * @param input - Validated query parameters
 * @returns List of batches with next cursor
 */
export async function listBatches(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	input: ListBatchesInput
): Promise<ListBatchesResult> {
	const { limit, cursor } = input;

	// Build query conditions
	const conditions = [eq(batch.userId, userId)];

	// If cursor provided, get batches created before the cursor
	if (cursor) {
		const decoded = decodeCursor(cursor);
		if (decoded) {
			// Use (createdAt, id) tuple for stable cursor-based pagination
			const cursorCondition = or(
				lt(batch.createdAt, new Date(decoded.createdAt)),
				and(eq(batch.createdAt, new Date(decoded.createdAt)), lt(batch.id, decoded.id))
			);
			if (cursorCondition) conditions.push(cursorCondition);
		}
	}

	// Fetch batches with one extra to determine if there's a next page
	const batches = await db
		.select({
			id: batch.id,
			status: batch.status,
			createdAt: batch.createdAt,
			updatedAt: batch.updatedAt,
		})
		.from(batch)
		.where(and(...conditions))
		.orderBy(sql`${batch.createdAt} DESC, ${batch.id} DESC`)
		.limit(limit + 1);

	// Determine if there's a next page
	const hasNextPage = batches.length > limit;
	const resultBatches = hasNextPage ? batches.slice(0, limit) : batches;

	// Encode next cursor
	let nextCursor: string | null = null;
	if (hasNextPage && resultBatches.length > 0) {
		const lastBatch = resultBatches[resultBatches.length - 1];
		nextCursor = encodeCursor({
			createdAt: lastBatch.createdAt.getTime(),
			id: lastBatch.id,
		});
	}

	// Get candidate counts for all batches in one query
	const batchIds = resultBatches.map((b) => b.id);
	let candidateCounts: { batchId: string; count: number }[] = [];

	if (batchIds.length > 0) {
		candidateCounts = await db
			.select({
				batchId: candidate.batchId,
				count: count(),
			})
			.from(candidate)
			.where(
				sql`${candidate.batchId} IN (${sql.join(
					batchIds.map((id) => sql`${id}`),
					sql`, `
				)})`
			)
			.groupBy(candidate.batchId);
	}

	// Build map of batch ID to candidate count
	const countMap = new Map<string, number>();
	for (const cc of candidateCounts) {
		countMap.set(cc.batchId, cc.count);
	}

	return {
		batches: resultBatches.map((b) => ({
			id: b.id,
			status: b.status,
			candidateCount: countMap.get(b.id) ?? 0,
			createdAt: b.createdAt.getTime(),
			updatedAt: b.updatedAt.getTime(),
		})),
		nextCursor,
	};
}
