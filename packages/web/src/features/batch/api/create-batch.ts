import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { CreateBatchRequest, CreateBatchResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function
export async function createBatch(request: CreateBatchRequest): Promise<CreateBatchResponse> {
	return apiRequest<CreateBatchResponse>('/api/batch', {
		method: 'POST',
		body: request,
	});
}

// React Query mutation hook
export function useCreateBatch() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: createBatch,
		onSuccess: () => {
			// Invalidate batches list to refetch
			queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
		},
	});
}
