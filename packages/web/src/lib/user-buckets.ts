/**
 * Shared user bucket query hook - used across multiple features.
 * CRUD mutations remain in settings feature since they're settings-specific.
 */

import { useQuery } from '@tanstack/react-query';
import { api, buildApiRequestError, type InferResponseType } from '@/lib/api-rpc';

// Query key factory
export const userBucketKeys = {
	all: ['user-bucket'] as const,
	list: () => [...userBucketKeys.all, 'list'] as const,
};

// Infer response types from API
type ListBucketsFullResponse = InferResponseType<(typeof api.api)['user-bucket']['$get']>;
export type ListBucketsResponse = Extract<ListBucketsFullResponse, { buckets: unknown }>;
export type UserBucket = ListBucketsResponse['buckets'][number];

// Fetcher: List all buckets
export async function listUserBuckets(): Promise<ListBucketsResponse> {
	const res = await api.api['user-bucket'].$get();

	if (!res.ok) {
		throw await buildApiRequestError(res);
	}

	return res.json() as Promise<ListBucketsResponse>;
}

// Hook: List buckets
export function useUserBuckets(options?: { enabled?: boolean }) {
	return useQuery({
		queryKey: userBucketKeys.list(),
		queryFn: listUserBuckets,
		enabled: options?.enabled ?? true,
	});
}
