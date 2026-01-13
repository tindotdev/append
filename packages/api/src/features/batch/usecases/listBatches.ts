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
 * Status breakdown for a batch.
 */
export interface StatusBreakdown {
	ready: number; // Has effective bucket + text, not accepted
	pending: number; // Awaiting suggestions or missing values
	accepted: number; // Already materialized
	error: number; // Suggestion failed
}

/**
 * Batch summary for list response.
 */
export interface BatchSummary {
	id: string;
	status: BatchStatus;
	candidateCount: number;
	statusBreakdown: StatusBreakdown;
	acceptanceRate: number; // 0-100 percentage
	sampleTerms: string[]; // First 3-5 terms
	hasErrors: boolean;
	errorCount: number;
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

	// Get enhanced metadata for all batches in one query
	const batchIds = resultBatches.map((b) => b.id);
	let candidateStats: {
		batchId: string;
		totalCount: number;
		acceptedCount: number;
		pendingCount: number;
		errorCount: number;
		readyCount: number;
	}[] = [];
	const sampleTermsMap: Map<string, string[]> = new Map();

	if (batchIds.length > 0) {
		// Query status breakdown using SQL aggregation
		candidateStats = await db
			.select({
				batchId: candidate.batchId,
				totalCount: count(),
				// Accepted: has materialized term sense ID
				acceptedCount: sql<number>`sum(case when ${candidate.materializedTermSenseId} is not null then 1 else 0 end)`,
				// Error: suggestion status is 'error'
				errorCount: sql<number>`sum(case when ${candidate.suggestionStatus} = 'error' then 1 else 0 end)`,
				// Pending: suggestion in progress OR missing effective values
				pendingCount: sql<number>`sum(case when
					${candidate.materializedTermSenseId} is null
					and (${candidate.suggestionStatus} = 'in_progress'
						or (${candidate.suggestionStatus} != 'error'
							and (coalesce(${candidate.chosenBucket}, ${candidate.suggestedBucket}) is null
								or coalesce(${candidate.chosenText}, ${candidate.suggestedText}) is null)))
					then 1 else 0 end)`,
				// Ready: has effective values and not accepted
				readyCount: sql<number>`sum(case when
					${candidate.materializedTermSenseId} is null
					and ${candidate.suggestionStatus} != 'in_progress'
					and ${candidate.suggestionStatus} != 'error'
					and coalesce(${candidate.chosenBucket}, ${candidate.suggestedBucket}) is not null
					and coalesce(${candidate.chosenText}, ${candidate.suggestedText}) is not null
					then 1 else 0 end)`,
			})
			.from(candidate)
			.where(
				sql`${candidate.batchId} IN (${sql.join(
					batchIds.map((id) => sql`${id}`),
					sql`, `
				)})`
			)
			.groupBy(candidate.batchId);

		// Query sample terms (first 3 per batch)
		for (const batchId of batchIds) {
			const terms = await db
				.select({
					term: candidate.term,
				})
				.from(candidate)
				.where(eq(candidate.batchId, batchId))
				.orderBy(candidate.position)
				.limit(3);

			sampleTermsMap.set(
				batchId,
				terms.map((t) => t.term)
			);
		}
	}

	// Build map of batch ID to stats
	const statsMap = new Map<string, (typeof candidateStats)[0]>();
	for (const stat of candidateStats) {
		statsMap.set(stat.batchId, stat);
	}

	return {
		batches: resultBatches.map((b) => {
			const stats = statsMap.get(b.id);
			const totalCount = stats?.totalCount ?? 0;
			const acceptedCount = stats?.acceptedCount ?? 0;
			const errorCount = stats?.errorCount ?? 0;
			const pendingCount = stats?.pendingCount ?? 0;
			const readyCount = stats?.readyCount ?? 0;

			return {
				id: b.id,
				status: b.status,
				candidateCount: totalCount,
				statusBreakdown: {
					ready: readyCount,
					pending: pendingCount,
					accepted: acceptedCount,
					error: errorCount,
				},
				acceptanceRate: totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0,
				sampleTerms: sampleTermsMap.get(b.id) ?? [],
				hasErrors: errorCount > 0,
				errorCount,
				createdAt: b.createdAt.getTime(),
				updatedAt: b.updatedAt.getTime(),
			};
		}),
		nextCursor,
	};
}
