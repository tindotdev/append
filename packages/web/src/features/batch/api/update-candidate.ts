import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError } from '@/lib/api-rpc';
import type { UpdateCandidateRequest, UpdateCandidateResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function using Hono RPC
export async function updateCandidate(id: string, request: UpdateCandidateRequest): Promise<UpdateCandidateResponse> {
	const res = await api.api.candidate[':id'].$put({
		param: { id },
		json: request,
	});

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
		throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
	}

	// Cast to expected type - API returns compatible structure
	return res.json() as Promise<UpdateCandidateResponse>;
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
