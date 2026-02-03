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

type Condition = Parameters<typeof and>[number];

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

function needsCustomSort(sortBy: ListBatchesInput['sortBy']): boolean {
	return sortBy === 'candidateCount' || sortBy === 'acceptanceRate';
}

async function buildFilterConditions(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	input: ListBatchesInput
): Promise<{ conditions: Condition[]; earlyEmpty: boolean; customSort: boolean }> {
	const { cursor, search, status, hasErrors, sortBy } = input;

	const conditions: Condition[] = [eq(batch.userId, userId)];

	if (status) {
		conditions.push(eq(batch.status, status));
	}

	// Search filter: find batch IDs where any candidate term matches
	if (search) {
		const searchPattern = `%${search.toLowerCase()}%`;
		const matchingBatches = await db
			.selectDistinct({ batchId: candidate.batchId })
			.from(candidate)
			.innerJoin(batch, eq(candidate.batchId, batch.id))
			.where(and(eq(batch.userId, userId), like(sql`lower(${candidate.term})`, searchPattern)));

		const searchBatchIds = matchingBatches.map((b) => b.batchId);
		if (searchBatchIds.length === 0) {
			return { conditions: [], earlyEmpty: true, customSort: needsCustomSort(sortBy) };
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
		if (errorBatchIds.length === 0) {
			return { conditions: [], earlyEmpty: true, customSort: needsCustomSort(sortBy) };
		}

		conditions.push(inArray(batch.id, errorBatchIds));
	}

	const customSort = needsCustomSort(sortBy);

	// If cursor provided and not using custom sort, get batches created before the cursor
	if (cursor && !customSort) {
		const decoded = decodeCursor(cursor);
		if (decoded) {
			const cursorCondition = or(
				lt(batch.createdAt, new Date(decoded.createdAt)),
				and(eq(batch.createdAt, new Date(decoded.createdAt)), lt(batch.id, decoded.id))
			);
			conditions.push(cursorCondition);
		}
	}

	return { conditions, earlyEmpty: false, customSort };
}

type CandidateStatsRow = {
	batchId: string;
	totalCount: number;
	acceptedCount: number;
	pendingCount: number;
	errorCount: number;
	readyCount: number;
};

async function fetchCandidateStats(db: DrizzleD1Database<typeof schema>, batchIds: string[]): Promise<Map<string, CandidateStatsRow>> {
	const statsMap = new Map<string, CandidateStatsRow>();
	if (batchIds.length === 0) return statsMap;

	const candidateStats = await db
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

	for (const stat of candidateStats) {
		statsMap.set(stat.batchId, stat);
	}

	return statsMap;
}

async function fetchSampleTerms(db: DrizzleD1Database<typeof schema>, batchIds: string[]): Promise<Map<string, string[]>> {
	const sampleTermsMap: Map<string, string[]> = new Map();
	if (batchIds.length === 0) return sampleTermsMap;

	// Use a single query with ROW_NUMBER() window function to get first 3 terms per batch
	type SampleTermRow = { batchId: string; term: string };
	const sampleTerms: SampleTermRow[] = await db.all(
		sql`
			WITH ranked_terms AS (
				SELECT
					${candidate.batchId} as batch_id,
					${candidate.term} as term,
					ROW_NUMBER() OVER (PARTITION BY ${candidate.batchId} ORDER BY ${candidate.position}) as row_num
				FROM ${candidate}
				WHERE ${candidate.batchId} IN (${sql.join(
					batchIds.map((id) => sql`${id}`),
					sql`, `
				)})
			)
			SELECT batch_id as batchId, term
			FROM ranked_terms
			WHERE row_num <= 3
			ORDER BY batch_id, row_num
		`
	);

	// Group by batch ID
	for (const row of sampleTerms) {
		if (!sampleTermsMap.has(row.batchId)) {
			sampleTermsMap.set(row.batchId, []);
		}
		sampleTermsMap.get(row.batchId)?.push(row.term);
	}

	return sampleTermsMap;
}

function applyCustomSort(opts: {
	summaries: BatchSummary[];
	sortBy: ListBatchesInput['sortBy'];
	sortOrder: ListBatchesInput['sortOrder'];
	cursor: string | null | undefined;
}): BatchSummary[] {
	const { summaries, sortBy, sortOrder, cursor } = opts;
	const descOrder = sortOrder !== 'asc';
	const multiplier = descOrder ? -1 : 1;

	if (sortBy === 'candidateCount') {
		summaries.sort((a, b) => multiplier * (a.candidateCount - b.candidateCount));
	} else if (sortBy === 'acceptanceRate') {
		summaries.sort((a, b) => multiplier * (a.acceptanceRate - b.acceptanceRate));
	}

	if (!cursor) return summaries;

	const cursorIndex = summaries.findIndex((b) => b.id === cursor);
	if (cursorIndex === -1) return summaries;
	return summaries.slice(cursorIndex + 1);
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
	const { limit, cursor, sortBy, sortOrder } = input;

	const { conditions, earlyEmpty, customSort } = await buildFilterConditions(db, userId, input);
	if (earlyEmpty) return { batches: [], nextCursor: null };

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
	const fetchLimit = customSort ? 1000 : limit + 1;
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
	const [statsMap, sampleTermsMap] = await Promise.all([fetchCandidateStats(db, batchIds), fetchSampleTerms(db, batchIds)]);

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
	if (customSort) {
		batchSummaries = applyCustomSort({ summaries: batchSummaries, sortBy, sortOrder, cursor });
	}

	// Determine pagination
	const hasNextPage = batchSummaries.length > limit;
	const resultBatches = hasNextPage ? batchSummaries.slice(0, limit) : batchSummaries;

	// Encode next cursor
	let nextCursor: string | null = null;
	if (hasNextPage && resultBatches.length > 0) {
		const lastBatch = resultBatches[resultBatches.length - 1];
		if (customSort) {
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
