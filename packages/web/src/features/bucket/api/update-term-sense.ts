import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bucketKeys } from './get-bucket-feed';
import { termKeys } from './get-term';
import { patchJsonWithVersion } from './request';

// Response type
interface UpdateTermSenseResponse {
	sense: {
		id: string;
		termId: string;
		bucket: string;
		text: string;
		source: string;
		senseLabel: string | null;
		flaggedReason: string | null;
		version: number;
		createdAt: number;
	};
}

interface UpdateTermSenseRequest {
	expectedVersion: number;
	text?: string;
	bucket?: string | null;
}

/**
 * Update a term sense's text or bucket.
 */
export async function updateTermSense(senseId: string, request: UpdateTermSenseRequest): Promise<UpdateTermSenseResponse> {
	return patchJsonWithVersion<UpdateTermSenseResponse, UpdateTermSenseRequest>(`/api/term-sense/${senseId}`, request);
}

/**
 * React Query mutation hook for updating a term sense.
 */
export function useUpdateTermSense() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ senseId, request }: { senseId: string; request: UpdateTermSenseRequest }) => updateTermSense(senseId, request),
		onSuccess: () => {
			// Invalidate related queries
			// We don't know which term this sense belongs to, so invalidate all term details
			queryClient.invalidateQueries({ queryKey: termKeys.all });
			// Also invalidate bucket feeds since the sense text may have changed
			queryClient.invalidateQueries({ queryKey: bucketKeys.all });
		},
	});
}
