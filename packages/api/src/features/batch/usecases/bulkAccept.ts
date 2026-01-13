/**
 * Use case: Bulk accept multiple batches.
 *
 * Processes each batch individually and aggregates results.
 * Partial failures are expected and reported per-batch.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../../../db';
import type { BulkAcceptSummary, BulkBatchIdsInput } from '../validation/bulkBatch.schema';
import { acceptAll } from './acceptAll';

/**
 * Bulk accept multiple batches.
 *
 * @param db - Drizzle D1 database instance
 * @param rawDb - Raw D1 database for batch operations
 * @param userId - User ID
 * @param input - Validated input with batch IDs
 * @returns Bulk accept summary with per-batch results
 */
export async function bulkAccept(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	input: BulkBatchIdsInput
): Promise<BulkAcceptSummary> {
	const { batchIds } = input;
	const results: BulkAcceptSummary['results'] = [];
	let successCount = 0;
	let failureCount = 0;

	// Process batches sequentially to avoid overwhelming the database
	for (const batchId of batchIds) {
		const clientRequestId = crypto.randomUUID();

		const result = await acceptAll(db, rawDb, userId, batchId, { clientRequestId });

		if (result.success) {
			successCount++;
			results.push({
				batchId,
				success: true,
				acceptedCount: result.result.acceptedCount,
				termCreatedCount: result.result.termCreatedCount,
			});
		} else {
			failureCount++;
			const errorInfo = mapAcceptError(result.error);
			results.push({
				batchId,
				success: false,
				error: errorInfo,
			});
		}
	}

	return {
		successCount,
		failureCount,
		results,
	};
}

/**
 * Map accept error to a client-friendly error object.
 */
function mapAcceptError(error: { type: string; candidateIds?: string[]; originalBatchId?: string; message?: string }): {
	code: string;
	message: string;
} {
	switch (error.type) {
		case 'not_found':
			return { code: 'NOT_FOUND', message: 'Batch not found' };
		case 'forbidden':
			return { code: 'FORBIDDEN', message: 'Access denied' };
		case 'suggestions_in_progress':
			return { code: 'SUGGESTIONS_IN_PROGRESS', message: 'Some candidates have suggestions in progress' };
		case 'missing_effective_fields':
			return { code: 'MISSING_EFFECTIVE_FIELDS', message: 'Some candidates are missing bucket or text' };
		case 'idempotency_conflict':
			return { code: 'IDEMPOTENCY_CONFLICT', message: 'Duplicate request' };
		case 'internal_error':
			return { code: 'INTERNAL_ERROR', message: error.message ?? 'Internal error' };
		default:
			return { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' };
	}
}
