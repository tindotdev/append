import type { BatchResponse, Candidate } from '../types';

/**
 * Update a candidate within a batch, returning a new batch with the updated candidate.
 * Used for optimistic updates after candidate mutations.
 */
export function updateBatchCandidate(batch: BatchResponse | null, candidate: Candidate): BatchResponse | null {
	if (!batch) return batch;
	return {
		...batch,
		candidates: batch.candidates.map((item) => (item.id === candidate.id ? candidate : item)),
	};
}
