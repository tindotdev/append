import * as v from 'valibot';

export const AcceptCandidateSchema = v.object({
	clientRequestId: v.pipe(v.string(), v.uuid('clientRequestId must be a valid UUID')),
	expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
});

export type AcceptCandidateInput = v.InferOutput<typeof AcceptCandidateSchema>;

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
