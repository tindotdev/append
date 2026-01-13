import { api, parseRpcJson } from '@/lib/api-rpc';

/**
 * Result for a single batch in bulk accept operation.
 */
export interface BulkAcceptBatchResult {
	batchId: string;
	success: boolean;
	error?: {
		code: string;
		message: string;
	};
	acceptedCount?: number;
	termCreatedCount?: number;
}

/**
 * Summary for bulk accept operation.
 */
export interface BulkAcceptSummary {
	successCount: number;
	failureCount: number;
	results: BulkAcceptBatchResult[];
}

// Helper to access the bulk accept endpoint
const bulkAcceptEndpoint = api.api.batch.bulk.accept;

/**
 * Bulk accept multiple batches and materialize to terms/senses.
 *
 * @param batchIds - Array of batch IDs to accept
 * @returns Bulk accept summary with per-batch results
 */
export async function bulkAcceptBatches(batchIds: string[]): Promise<BulkAcceptSummary> {
	const res = await bulkAcceptEndpoint.$post({
		json: {
			batchIds,
		},
	});

	return parseRpcJson<BulkAcceptSummary>(res);
}
