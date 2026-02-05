import { useMutation } from '@tanstack/react-query';
import { api, parseRpcJson } from '@/lib/api-rpc';

export function useDeleteAccount() {
	return useMutation({
		mutationFn: async (input: { email: string; confirm: string }): Promise<void> => {
			const res = await api.api.account.delete.$post({
				json: {
					email: input.email,
					confirm: input.confirm,
				},
			});

			// 204 success has no JSON body.
			if (!res.ok) {
				await parseRpcJson(res);
			}
		},
	});
}
