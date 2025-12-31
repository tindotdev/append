import { api, ApiRequestError } from '@/lib/api-rpc';

/**
 * Accept summary response from the API.
 */
export interface AcceptSummary {
	batchId: string;
	status: 'accepted';
	candidateCount: number;
	acceptedCount: number;
	skippedAlreadyAcceptedCount: number;
	termCreatedCount: number;
	termSenseCreatedCount: number;
	flaggedCount: number;
}

// Helper to access the accept endpoint
const acceptEndpoint = api.api.batch[':id'].accept;

/**
 * Accept all candidates in a batch and materialize to terms/senses.
 *
 * @param batchId - The batch ID to accept
 * @returns Accept summary with counts
 */
export async function acceptBatch(batchId: string): Promise<AcceptSummary> {
	const res = await acceptEndpoint.$post({
		param: { id: batchId },
		json: {
			clientRequestId: crypto.randomUUID(),
		},
	});

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
		throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
	}

	// Cast to expected type - API returns compatible structure
	return res.json() as Promise<AcceptSummary>;
}
