import { api, parseRpcJson } from '@/lib/api-rpc';

/**
 * Accept candidate result from the API.
 */
export interface AcceptCandidateResult {
	candidate: {
		id: string;
		status: string;
		materializedTermId: string;
		materializedTermSenseId: string;
		version: number;
	};
	termId: string;
	termSenseId: string;
	isNewTerm: boolean;
	flaggedReason: string | null;
}

// Helper to access the accept endpoint
const acceptEndpoint = api.api.candidate[':id'].accept;

/**
 * Accept a single candidate and materialize to term/sense.
 *
 * @param candidateId - The candidate ID to accept
 * @param expectedVersion - The expected version for optimistic locking
 * @returns Accept result with materialized IDs
 */
export async function acceptCandidate(candidateId: string, expectedVersion: number): Promise<AcceptCandidateResult> {
	const res = await acceptEndpoint.$post({
		param: { id: candidateId },
		json: {
			clientRequestId: crypto.randomUUID(),
			expectedVersion,
		},
	});

	return parseRpcJson<AcceptCandidateResult>(res, { includeCurrentVersion: true });
}
