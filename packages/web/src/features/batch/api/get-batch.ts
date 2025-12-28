import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { BatchResponse } from '../types';

// Query key factory
export const batchKeys = {
	all: ['batch'] as const,
	lists: () => [...batchKeys.all, 'list'] as const,
	list: (cursor?: string) => [...batchKeys.lists(), { cursor }] as const,
	details: () => [...batchKeys.all, 'detail'] as const,
	detail: (id: string) => [...batchKeys.details(), id] as const,
};

// Fetcher function
export async function getBatch(id: string): Promise<BatchResponse> {
	return apiRequest<BatchResponse>(`/api/batch/${id}`);
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
