import { type QueryFunctionContext, useInfiniteQuery } from '@tanstack/react-query';
import { api, parseRpcJson } from '@/lib/api-rpc';
import type { ListBatchesOptions, ListBatchesResponse } from '../types';
import { batchKeys } from './get-batch';

// Fetcher function using Hono RPC
export async function listBatches(options?: ListBatchesOptions): Promise<ListBatchesResponse> {
	const res = await api.api.batch.$get({
		query: {
			limit: options?.limit !== undefined ? String(options.limit) : undefined,
			cursor: options?.cursor,
			search: options?.search,
			status: options?.status,
			hasErrors: options?.hasErrors !== undefined ? String(options.hasErrors) : undefined,
			sortBy: options?.sortBy,
			sortOrder: options?.sortOrder,
		},
	});

	// Cast to expected type - API returns compatible structure
	return parseRpcJson<ListBatchesResponse>(res);
}

// Filter options for the batches hook (excludes pagination params)
export interface BatchesFilterOptions {
	search?: string;
	status?: ListBatchesOptions['status'];
	hasErrors?: boolean;
	sortBy?: ListBatchesOptions['sortBy'];
	sortOrder?: ListBatchesOptions['sortOrder'];
}

// React Query hook with infinite scroll support and filtering
export function useBatches(filters?: BatchesFilterOptions) {
	return useInfiniteQuery({
		// Include filters in queryKey so cache is properly keyed
		queryKey: [...batchKeys.lists(), filters ?? {}],
		queryFn: ({ pageParam }: QueryFunctionContext) =>
			listBatches({
				cursor: pageParam as string | undefined,
				search: filters?.search,
				status: filters?.status,
				hasErrors: filters?.hasErrors,
				sortBy: filters?.sortBy,
				sortOrder: filters?.sortOrder,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});
}
