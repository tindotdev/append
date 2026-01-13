/**
 * Valibot schema for POST /api/batch/:id/accept.
 */

import * as v from 'valibot';

/**
 * Schema for accept all request body.
 */
export const AcceptAllSchema = v.object({
	clientRequestId: v.pipe(v.string(), v.uuid('clientRequestId must be a valid UUID')),
});

/**
 * Type for validated accept all request.
 */
export type AcceptAllInput = v.InferOutput<typeof AcceptAllSchema>;

/**
 * Accept summary response.
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
