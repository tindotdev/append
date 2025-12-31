import { queryOptions, useQuery } from '@tanstack/react-query';
import { api, ApiRequestError } from '@/lib/api-rpc';
import type { BatchResponse } from '../types';

// Query key factory
export const batchKeys = {
	all: ['batch'] as const,
	lists: () => [...batchKeys.all, 'list'] as const,
	list: (cursor?: string) => [...batchKeys.lists(), { cursor }] as const,
	details: () => [...batchKeys.all, 'detail'] as const,
	detail: (id: string) => [...batchKeys.details(), id] as const,
};

// Fetcher function using Hono RPC
export async function getBatch(id: string): Promise<BatchResponse> {
	const res = await api.api.batch[':id'].$get({
		param: { id },
	});

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
		throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
	}

	// Cast to expected type - API returns compatible structure
	return res.json() as Promise<BatchResponse>;
}

// Query options (composable)
export function getBatchQueryOptions(id: string) {
	return queryOptions({
		queryKey: batchKeys.detail(id),
		queryFn: () => getBatch(id),
	});
}

// React Query hook
export function useBatch(id: string) {
	return useQuery(getBatchQueryOptions(id));
}
