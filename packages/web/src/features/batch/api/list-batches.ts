import { type QueryFunctionContext, useInfiniteQuery } from '@tanstack/react-query';
import { ApiRequestError, api } from '@/lib/api-rpc';
import type { ListBatchesOptions, ListBatchesResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function using Hono RPC
export async function listBatches(options?: ListBatchesOptions): Promise<ListBatchesResponse> {
	const res = await api.api.batch.$get({
		query: {
			limit: options?.limit !== undefined ? String(options.limit) : undefined,
			cursor: options?.cursor,
		},
	});

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
		throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
	}

	// Cast to expected type - API returns compatible structure
	return res.json() as Promise<ListBatchesResponse>;
}

// React Query hook with infinite scroll support
export function useBatches() {
	return useInfiniteQuery({
		queryKey: batchKeys.lists(),
		queryFn: ({ pageParam }: QueryFunctionContext) => listBatches({ cursor: pageParam as string | undefined }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});
}
