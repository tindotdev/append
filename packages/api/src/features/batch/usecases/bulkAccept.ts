/**
 * Use case: Bulk accept multiple batches.
 *
 * Processes each batch individually and aggregates results.
 * Partial failures are expected and reported per-batch.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../../../db';
import { mapBulkOperationError } from '../../../shared/bulk-error-map';
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
			const errorInfo = mapBulkOperationError(result.error, {
				suggestions_in_progress: {
					code: 'SUGGESTIONS_IN_PROGRESS',
					message: 'Some candidates have suggestions in progress',
				},
				missing_effective_fields: {
					code: 'MISSING_EFFECTIVE_FIELDS',
					message: 'Some candidates are missing bucket or text',
				},
				idempotency_conflict: { code: 'IDEMPOTENCY_CONFLICT', message: 'Duplicate request' },
				internal_error: {
					code: 'INTERNAL_ERROR',
					message: result.error.type === 'internal_error' ? result.error.message : 'Internal error',
				},
			});
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
