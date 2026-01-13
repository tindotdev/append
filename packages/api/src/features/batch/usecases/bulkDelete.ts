/**
 * Use case: Bulk delete multiple batches.
 *
 * Processes each batch individually and aggregates results.
 * Partial failures are expected and reported per-batch.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../../../db';
import type { BulkBatchIdsInput, BulkDeleteSummary } from '../validation/bulkBatch.schema';
import { deleteBatch } from './deleteBatch';

/**
 * Bulk delete multiple batches.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID
 * @param input - Validated input with batch IDs
 * @returns Bulk delete summary with per-batch results
 */
export async function bulkDeleteBatches(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	input: BulkBatchIdsInput
): Promise<BulkDeleteSummary> {
	const { batchIds } = input;
	const results: BulkDeleteSummary['results'] = [];
	let successCount = 0;
	let failureCount = 0;

	// Process batches sequentially to avoid overwhelming the database
	for (const batchId of batchIds) {
		const result = await deleteBatch(db, userId, batchId);

		if (result.success) {
			successCount++;
			results.push({
				batchId,
				success: true,
			});
		} else {
			failureCount++;
			const errorInfo = mapDeleteError(result.error);
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
 * Map delete error to a client-friendly error object.
 */
function mapDeleteError(error: { type: string }): { code: string; message: string } {
	switch (error.type) {
		case 'not_found':
			return { code: 'NOT_FOUND', message: 'Batch not found' };
		case 'forbidden':
			return { code: 'FORBIDDEN', message: 'Access denied' };
		default:
			return { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' };
	}
}
