import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL, ApiRequestError } from '@/lib/api-rpc';
import { termKeys } from './get-term';

// Response type
interface UpdateTermResponse {
	term: {
		id: string;
		displayTerm: string;
		canonical: string;
		version: number;
		createdAt: number;
	};
}

interface UpdateTermRequest {
	expectedVersion: number;
	displayTerm: string;
}

/**
 * Update a term's displayTerm.
 */
export async function updateTerm(termId: string, request: UpdateTermRequest): Promise<UpdateTermResponse> {
	const res = await fetch(`${API_URL}/api/term/${termId}`, {
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

	return res.json() as Promise<UpdateTermResponse>;
}

/**
 * React Query mutation hook for updating a term.
 */
export function useUpdateTerm() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ termId, request }: { termId: string; request: UpdateTermRequest }) => updateTerm(termId, request),
		onSuccess: (_data, variables) => {
			// Invalidate term detail query to refetch
			queryClient.invalidateQueries({ queryKey: termKeys.detail(variables.termId) });
		},
	});
}
