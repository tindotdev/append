import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { UpdateCandidateRequest, UpdateCandidateResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function
export async function updateCandidate(id: string, request: UpdateCandidateRequest): Promise<UpdateCandidateResponse> {
	return apiRequest<UpdateCandidateResponse>(`/api/candidate/${id}`, {
		method: 'PUT',
		body: request,
	});
}

// React Query mutation hook
export function useUpdateCandidate(batchId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, request }: { id: string; request: UpdateCandidateRequest }) => updateCandidate(id, request),
		onSuccess: () => {
			// Invalidate the specific batch to refetch
			queryClient.invalidateQueries({ queryKey: batchKeys.detail(batchId) });
		},
	});
}
