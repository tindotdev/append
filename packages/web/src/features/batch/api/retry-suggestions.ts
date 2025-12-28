import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { RetrySuggestionsResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function
export async function retrySuggestions(batchId: string): Promise<RetrySuggestionsResponse> {
	return apiRequest<RetrySuggestionsResponse>(`/api/batch/${batchId}/suggest`, {
		method: 'POST',
	});
}

// React Query mutation hook
export function useRetrySuggestions(batchId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => retrySuggestions(batchId),
		onSuccess: () => {
			// Invalidate the specific batch to refetch
			queryClient.invalidateQueries({ queryKey: batchKeys.detail(batchId) });
		},
	});
}
