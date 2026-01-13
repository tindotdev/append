/**
 * Use case: List batches for a user.
 *
 * Returns paginated batches with candidate counts.
 * Supports search, filtering, and sorting.
 */

import { and, count, eq, inArray, like, lt, or, sql } from 'drizzle-orm';
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
 * List batches for a user with pagination, search, filtering, and sorting.
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
	const { limit, cursor, search, status, hasErrors, sortBy, sortOrder } = input;

	// Build query conditions
	const conditions = [eq(batch.userId, userId)];

	// Status filter
	if (status) {
		conditions.push(eq(batch.status, status));
	}

	// Search filter: find batch IDs where any candidate term matches
	let searchBatchIds: string[] | null = null;
	if (search) {
		const searchPattern = `%${search.toLowerCase()}%`;
		const matchingBatches = await db
			.selectDistinct({ batchId: candidate.batchId })
			.from(candidate)
			.innerJoin(batch, eq(candidate.batchId, batch.id))
			.where(and(eq(batch.userId, userId), like(sql`lower(${candidate.term})`, searchPattern)));

		searchBatchIds = matchingBatches.map((b) => b.batchId);

		// If no matches, return empty result early
		if (searchBatchIds.length === 0) {
			return { batches: [], nextCursor: null };
		}

		conditions.push(inArray(batch.id, searchBatchIds));
	}

	// hasErrors filter: find batch IDs with error candidates
	if (hasErrors === true) {
		const errorBatches = await db
			.selectDistinct({ batchId: candidate.batchId })
			.from(candidate)
			.innerJoin(batch, eq(candidate.batchId, batch.id))
			.where(and(eq(batch.userId, userId), eq(candidate.suggestionStatus, 'error')));

		const errorBatchIds = errorBatches.map((b) => b.batchId);

		// If no matches, return empty result early
		if (errorBatchIds.length === 0) {
			return { batches: [], nextCursor: null };
		}

		conditions.push(inArray(batch.id, errorBatchIds));
	}

	// Determine if we need custom sorting (by candidateCount or acceptanceRate)
	const needsCustomSort = sortBy === 'candidateCount' || sortBy === 'acceptanceRate';

	// If cursor provided and not using custom sort, get batches created before the cursor
	if (cursor && !needsCustomSort) {
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

	// Build sort order
	const descOrder = sortOrder !== 'asc'; // Default to desc
	const orderByClause =
		sortBy === 'created' || !sortBy
			? descOrder
				? sql`${batch.createdAt} DESC, ${batch.id} DESC`
				: sql`${batch.createdAt} ASC, ${batch.id} ASC`
			: // For candidateCount and acceptanceRate, we'll sort in-memory after fetching stats
				sql`${batch.createdAt} DESC, ${batch.id} DESC`;

	// Fetch batches - get more if we need custom sorting
	const fetchLimit = needsCustomSort ? 1000 : limit + 1;
	const batches = await db
		.select({
			id: batch.id,
			status: batch.status,
			createdAt: batch.createdAt,
			updatedAt: batch.updatedAt,
		})
		.from(batch)
		.where(and(...conditions))
		.orderBy(orderByClause)
		.limit(fetchLimit);

	// Get enhanced metadata for all batches
	const batchIds = batches.map((b) => b.id);
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

	// Transform batches to summaries with stats
	let batchSummaries: BatchSummary[] = batches.map((b) => {
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
	});

	// Custom sort if needed
	if (needsCustomSort) {
		const multiplier = descOrder ? -1 : 1;

		if (sortBy === 'candidateCount') {
			batchSummaries.sort((a, b) => multiplier * (a.candidateCount - b.candidateCount));
		} else if (sortBy === 'acceptanceRate') {
			batchSummaries.sort((a, b) => multiplier * (a.acceptanceRate - b.acceptanceRate));
		}

		// Apply cursor-based pagination for custom sort
		if (cursor) {
			const cursorIndex = batchSummaries.findIndex((b) => b.id === cursor);
			if (cursorIndex !== -1) {
				batchSummaries = batchSummaries.slice(cursorIndex + 1);
			}
		}
	}

	// Determine pagination
	const hasNextPage = batchSummaries.length > limit;
	const resultBatches = hasNextPage ? batchSummaries.slice(0, limit) : batchSummaries;

	// Encode next cursor
	let nextCursor: string | null = null;
	if (hasNextPage && resultBatches.length > 0) {
		const lastBatch = resultBatches[resultBatches.length - 1];
		if (needsCustomSort) {
			// For custom sort, use batch ID as cursor
			nextCursor = lastBatch.id;
		} else {
			nextCursor = encodeCursor({
				createdAt: lastBatch.createdAt,
				id: lastBatch.id,
			});
		}
	}

	return {
		batches: resultBatches,
		nextCursor,
	};
}
