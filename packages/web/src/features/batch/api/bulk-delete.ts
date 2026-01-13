import { api, parseRpcJson } from '@/lib/api-rpc';

/**
 * Result for a single batch in bulk delete operation.
 */
export interface BulkDeleteBatchResult {
	batchId: string;
	success: boolean;
	error?: {
		code: string;
		message: string;
	};
}

/**
 * Summary for bulk delete operation.
 */
export interface BulkDeleteSummary {
	successCount: number;
	failureCount: number;
	results: BulkDeleteBatchResult[];
}

// Helper to access the bulk delete endpoint
const bulkDeleteEndpoint = api.api.batch.bulk.delete;

/**
 * Bulk delete multiple batches and all their candidates.
 *
 * @param batchIds - Array of batch IDs to delete
 * @returns Bulk delete summary with per-batch results
 */
export async function bulkDeleteBatches(batchIds: string[]): Promise<BulkDeleteSummary> {
	const res = await bulkDeleteEndpoint.$post({
		json: {
			batchIds,
		},
	});

	return parseRpcJson<BulkDeleteSummary>(res);
}
