import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL, ApiRequestError } from '@/lib/api-rpc';
import { bucketKeys } from './get-bucket-feed';
import { termKeys } from './get-term';

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
	const res = await fetch(`${API_URL}/api/term-sense/${senseId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(request),
	});

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string }; details?: { currentVersion?: number } };
		const error = new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
		// Attach currentVersion for version conflicts
		if (errorBody.details?.currentVersion !== undefined) {
			(error as ApiRequestError & { currentVersion?: number }).currentVersion = errorBody.details.currentVersion;
		}
		throw error;
	}

	return res.json() as Promise<UpdateTermSenseResponse>;
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
