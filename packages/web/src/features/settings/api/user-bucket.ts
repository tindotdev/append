/**
 * API client for user bucket CRUD operations using Hono RPC.
 * Read-only queries (useUserBuckets) are in @/lib/user-buckets for cross-feature access.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type InferResponseType, parseRpcJson } from '@/lib/api-rpc';

// Re-export shared types and hooks from lib
export { type ListBucketsResponse, type UserBucket, userBucketKeys, useUserBuckets } from '@/lib/user-buckets';

type CreateBucketFullResponse = InferResponseType<(typeof api.api)['user-bucket']['$post']>;
export type CreateBucketResponse = Extract<CreateBucketFullResponse, { id: string }>;

// Import for internal use
import { userBucketKeys } from '@/lib/user-buckets';

// Mutation: Create bucket
export interface CreateBucketInput {
	slug: string;
	name: string;
	description: string;
	color?: string | null;
	icon?: string | null;
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

			return parseRpcJson<CreateBucketResponse>(res);
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
	icon?: string | null;
}

export function useUpdateBucket() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: UpdateBucketInput }): Promise<{ id: string }> => {
			const res = await api.api['user-bucket'][':id'].$put({
				param: { id },
				json: input,
			});

			return parseRpcJson<{ id: string }>(res);
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

			return parseRpcJson<{ success: boolean }>(res, { includeDetails: true });
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

			return parseRpcJson<{ success: boolean }>(res);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: userBucketKeys.list() });
		},
	});
}
