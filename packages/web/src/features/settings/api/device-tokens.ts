import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, parseRpcJson } from '@/lib/api-rpc';

export type DeviceTokenListItem = {
	id: string;
	label: string | null;
	token_prefix: string;
	created_at_ms: number;
	last_used_at_ms: number | null;
	expires_at_ms: number | null;
	revoked_at_ms: number | null;
};

export type ListDeviceTokensResponse = {
	tokens: DeviceTokenListItem[];
};

export type CreateDeviceTokenResponse = {
	token_id: string;
	token: string;
	created_at_ms: number;
	expires_at_ms: number | null;
};

export const deviceTokenKeys = {
	all: ['deviceTokens'] as const,
	list: () => [...deviceTokenKeys.all, 'list'] as const,
};

export function useDeviceTokens() {
	return useQuery({
		queryKey: deviceTokenKeys.list(),
		queryFn: async (): Promise<ListDeviceTokensResponse> => {
			const res = await api.api['device-tokens'].$get();
			return parseRpcJson<ListDeviceTokensResponse>(res);
		},
	});
}

export function useCreateDeviceToken() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: { label?: string; expires_in_days?: number }): Promise<CreateDeviceTokenResponse> => {
			const res = await api.api['device-tokens'].$post({
				json: {
					label: input.label?.trim() ? input.label.trim() : undefined,
					expires_in_days: input.expires_in_days,
				},
			});
			return parseRpcJson<CreateDeviceTokenResponse>(res);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: deviceTokenKeys.list() });
		},
	});
}

export function useRevokeDeviceToken() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string): Promise<void> => {
			const res = await api.api['device-tokens'][':id'].$delete({ param: { id } });
			if (!res.ok) {
				await parseRpcJson(res);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: deviceTokenKeys.list() });
		},
	});
}
