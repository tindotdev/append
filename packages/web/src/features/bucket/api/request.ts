import { API_URL, buildApiRequestError } from '@/lib/api-rpc';

export async function patchJsonWithVersion<TResponse, TRequest>(path: string, request: TRequest): Promise<TResponse> {
	const res = await fetch(`${API_URL}${path}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(request),
	});

	if (!res.ok) {
		throw await buildApiRequestError(res, { includeCurrentVersion: true });
	}

	return res.json() as Promise<TResponse>;
}
