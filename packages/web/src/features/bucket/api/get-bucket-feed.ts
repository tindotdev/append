import type { Bucket } from '@append/contracts/types';
import { type QueryFunctionContext, useInfiniteQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { BucketFeedResponse, GetBucketFeedOptions } from '../types';

// Query key factory
export const bucketKeys = {
	all: ['bucket'] as const,
	feed: (slug: Bucket) => [...bucketKeys.all, 'feed', slug] as const,
};

// Fetcher function
export async function getBucketFeed(slug: Bucket, options?: GetBucketFeedOptions): Promise<BucketFeedResponse> {
	const params = new URLSearchParams();
	if (options?.limit !== undefined) {
		params.set('limit', String(options.limit));
	}
	if (options?.cursor) {
		params.set('cursor', options.cursor);
	}

	const queryString = params.toString();
	const path = `/api/bucket/${slug}${queryString ? `?${queryString}` : ''}`;

	return apiRequest<BucketFeedResponse>(path);
}

// React Query hook with infinite scroll support
export function useBucketFeed(slug: Bucket, options?: { enabled?: boolean }) {
	return useInfiniteQuery({
		queryKey: bucketKeys.feed(slug),
		queryFn: ({ pageParam }: QueryFunctionContext) => getBucketFeed(slug, { cursor: pageParam as string | undefined }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		enabled: options?.enabled ?? true,
	});
}
