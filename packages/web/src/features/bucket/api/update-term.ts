import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL, buildApiRequestError } from '@/lib/api-rpc';
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
		throw await buildApiRequestError(res, { includeCurrentVersion: true });
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
