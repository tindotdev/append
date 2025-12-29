import { apiRequest } from '@/lib/api-client';

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

/**
 * Accept all candidates in a batch and materialize to terms/senses.
 *
 * @param batchId - The batch ID to accept
 * @returns Accept summary with counts
 */
export async function acceptBatch(batchId: string): Promise<AcceptSummary> {
	return apiRequest<AcceptSummary>(`/api/batch/${batchId}/accept`, {
		method: 'POST',
		body: {
			clientRequestId: crypto.randomUUID(),
		},
	});
}
