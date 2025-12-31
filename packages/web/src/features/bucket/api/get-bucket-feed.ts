import { type QueryFunctionContext, useInfiniteQuery } from '@tanstack/react-query';
import { api, ApiRequestError, type InferResponseType } from '@/lib/api-rpc';

// Query key factory
export const bucketKeys = {
	all: ['bucket'] as const,
	feed: (slug: string) => [...bucketKeys.all, 'feed', slug] as const,
};

// Infer full response type from API, then extract success type
type FullResponse = InferResponseType<(typeof api.api.bucket)[':slug']['$get']>;
// Extract only the success type (has 'items' property, not 'error')
type BucketFeedResponse = Extract<FullResponse, { items: unknown }>;
export type { BucketFeedResponse };

// Options for the fetcher
interface GetBucketFeedOptions {
	limit?: number;
	cursor?: string;
}

// Fetcher function using Hono RPC
export async function getBucketFeed(slug: string, options?: GetBucketFeedOptions): Promise<BucketFeedResponse> {
	const res = await api.api.bucket[':slug'].$get({
		param: { slug },
		query: {
			limit: options?.limit !== undefined ? String(options.limit) : undefined,
			cursor: options?.cursor,
		},
	});

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
		throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
	}

	// Safe to cast - we checked res.ok so this is the success response
	return res.json() as Promise<BucketFeedResponse>;
}

// React Query hook with infinite scroll support
export function useBucketFeed(slug: string, options?: { enabled?: boolean }) {
	return useInfiniteQuery({
		queryKey: bucketKeys.feed(slug),
		queryFn: ({ pageParam }: QueryFunctionContext) => getBucketFeed(slug, { cursor: pageParam as string | undefined }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		enabled: options?.enabled ?? true,
	});
}
