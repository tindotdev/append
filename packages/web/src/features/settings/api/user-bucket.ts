/**
 * API client for user bucket CRUD operations using Hono RPC.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError, type InferResponseType } from '@/lib/api-rpc';

// Query key factory
export const userBucketKeys = {
	all: ['user-bucket'] as const,
	list: () => [...userBucketKeys.all, 'list'] as const,
};

// Infer response types from API
type ListBucketsFullResponse = InferResponseType<(typeof api.api)['user-bucket']['$get']>;
export type ListBucketsResponse = Extract<ListBucketsFullResponse, { buckets: unknown }>;
export type UserBucket = ListBucketsResponse['buckets'][number];

type CreateBucketFullResponse = InferResponseType<(typeof api.api)['user-bucket']['$post']>;
export type CreateBucketResponse = Extract<CreateBucketFullResponse, { id: string }>;

// Fetcher: List all buckets
export async function listUserBuckets(): Promise<ListBucketsResponse> {
	const res = await api.api['user-bucket'].$get();

	if (!res.ok) {
		const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
		throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
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

// Mutation: Create bucket
export interface CreateBucketInput {
	slug: string;
	name: string;
	description: string;
	color?: string | null;
}

export function useCreateBucket() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: CreateBucketInput): Promise<CreateBucketResponse> => {
			const res = await api.api['user-bucket'].$post({
				json: {
					slug: input.slug,
					name: input.name,
					description: input.description,
					color: input.color ?? undefined,
				},
			});

			if (!res.ok) {
				const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
				throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
			}

			return res.json() as Promise<CreateBucketResponse>;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: userBucketKeys.list() });
		},
	});
}

// Mutation: Update bucket
export interface UpdateBucketInput {
	name?: string;
	description?: string;
	color?: string | null;
}

export function useUpdateBucket() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: UpdateBucketInput }): Promise<{ id: string }> => {
			const res = await api.api['user-bucket'][':id'].$put({
				param: { id },
				json: input,
			});

			if (!res.ok) {
				const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
				throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
			}

			return res.json() as Promise<{ id: string }>;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: userBucketKeys.list() });
		},
	});
}

// Mutation: Delete bucket
export function useDeleteBucket() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string): Promise<{ success: boolean }> => {
			const res = await api.api['user-bucket'][':id'].$delete({
				param: { id },
			});

			if (!res.ok) {
				const errorBody = (await res.json()) as { error?: { code?: string; message?: string }; details?: { senseCount?: number } };
				throw new ApiRequestError(
					res.status,
					errorBody.error?.code ?? 'UNKNOWN_ERROR',
					errorBody.error?.message ?? res.statusText,
					errorBody.details
				);
			}

			return res.json() as Promise<{ success: boolean }>;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: userBucketKeys.list() });
		},
	});
}

// Mutation: Reorder buckets
export function useReorderBuckets() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (bucketIds: string[]): Promise<{ success: boolean }> => {
			const res = await api.api['user-bucket'].reorder.$put({
				json: { bucketIds },
			});

			if (!res.ok) {
				const errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
				throw new ApiRequestError(res.status, errorBody.error?.code ?? 'UNKNOWN_ERROR', errorBody.error?.message ?? res.statusText);
			}

			return res.json() as Promise<{ success: boolean }>;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: userBucketKeys.list() });
		},
	});
}
