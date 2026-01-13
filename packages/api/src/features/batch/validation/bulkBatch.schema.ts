/**
 * Valibot schemas for bulk batch operations.
 */

import * as v from 'valibot';

/**
 * Maximum number of batches that can be processed in a single bulk operation.
 */
export const MAX_BULK_BATCH_COUNT = 50;

/**
 * Schema for bulk batch operations that take an array of batch IDs.
 */
export const BulkBatchIdsSchema = v.object({
	batchIds: v.pipe(
		v.array(v.pipe(v.string(), v.nonEmpty('batchId cannot be empty'))),
		v.minLength(1, 'At least one batch ID is required'),
		v.maxLength(MAX_BULK_BATCH_COUNT, `Maximum ${MAX_BULK_BATCH_COUNT} batches per bulk operation`)
	),
});

/**
 * Type for validated bulk batch IDs input.
 */
export type BulkBatchIdsInput = v.InferOutput<typeof BulkBatchIdsSchema>;

/**
 * Result for a single batch operation in bulk.
 */
export interface BulkBatchResult {
	batchId: string;
	success: boolean;
	error?: {
		code: string;
		message: string;
	};
}

/**
 * Summary for bulk accept operation.
 */
export interface BulkAcceptSummary {
	successCount: number;
	failureCount: number;
	results: Array<
		BulkBatchResult & {
			acceptedCount?: number;
			termCreatedCount?: number;
		}
	>;
}

/**
 * Summary for bulk delete operation.
 */
export interface BulkDeleteSummary {
	successCount: number;
	failureCount: number;
	results: BulkBatchResult[];
}
