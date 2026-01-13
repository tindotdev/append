import { api, buildApiRequestError } from '@/lib/api-rpc';

// Helper to access the batch endpoint
const batchEndpoint = api.api.batch[':id'];

/**
 * Delete a batch and all its candidates.
 *
 * @param batchId - The batch ID to delete
 * @throws ApiRequestError on failure
 */
export async function deleteBatch(batchId: string): Promise<void> {
	const res = await batchEndpoint.$delete({
		param: { id: batchId },
	});

	if (!res.ok) {
		throw await buildApiRequestError(res);
	}

	// 204 No Content - nothing to return
}
