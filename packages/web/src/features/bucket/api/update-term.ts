import { useMutation, useQueryClient } from '@tanstack/react-query';
import { termKeys } from './get-term';
import { patchJsonWithVersion } from './request';

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
	return patchJsonWithVersion<UpdateTermResponse, UpdateTermRequest>(`/api/term/${termId}`, request);
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
