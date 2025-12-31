import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, api } from '@/lib/api-rpc';
import type { CreateBatchRequest, CreateBatchResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function using Hono RPC
export async function createBatch(request: CreateBatchRequest): Promise<CreateBatchResponse> {
	const res = await api.api.batch.$post({
		json: request,
	});

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
		throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
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
