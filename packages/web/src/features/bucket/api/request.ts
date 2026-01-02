import { apiFetch, parseRpcJson } from '@/lib/api-rpc';

export async function patchJsonWithVersion<TResponse, TRequest>(path: string, request: TRequest): Promise<TResponse> {
	const res = await apiFetch(path, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request),
	});

	return parseRpcJson<TResponse>(res, { includeCurrentVersion: true });
}
