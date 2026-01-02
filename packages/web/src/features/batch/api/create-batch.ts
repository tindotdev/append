import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, buildApiRequestError } from '@/lib/api-rpc';
import type { CreateBatchRequest, CreateBatchResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function using Hono RPC
export async function createBatch(request: CreateBatchRequest): Promise<CreateBatchResponse> {
	const res = await api.api.batch.$post({
		json: request,
	});

	if (!res.ok) {
		throw await buildApiRequestError(res);
	}

	// Cast to expected type - API returns compatible structure
	return res.json() as Promise<CreateBatchResponse>;
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
