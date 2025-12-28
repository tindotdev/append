import { useInfiniteQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { ListBatchesOptions, ListBatchesResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function
export async function listBatches(options?: ListBatchesOptions): Promise<ListBatchesResponse> {
	const params = new URLSearchParams();
	if (options?.limit !== undefined) {
		params.set('limit', String(options.limit));
	}
	if (options?.cursor) {
		params.set('cursor', options.cursor);
	}

	const queryString = params.toString();
	const path = `/api/batch${queryString ? `?${queryString}` : ''}`;

	return apiRequest<ListBatchesResponse>(path);
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
