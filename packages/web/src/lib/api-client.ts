// API URL - local dev or production
export const API_URL = import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.append.tindev.dev';

export interface ApiError {
	code: string;
	message: string;
}

export interface ApiErrorResponse {
	error: ApiError;
	details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'ApiRequestError';
	}
}

async function handleResponse<T>(response: Response): Promise<T> {
	const contentType = response.headers.get('content-type') || '';
	const isJson = contentType.includes('application/json');

	if (!response.ok) {
		if (isJson) {
			const errorBody = (await response.json()) as ApiErrorResponse;
			throw new ApiRequestError(response.status, errorBody.error.code, errorBody.error.message, errorBody.details);
		}
		throw new ApiRequestError(response.status, 'UNKNOWN_ERROR', response.statusText);
	}

	if (isJson) {
		return response.json() as Promise<T>;
	}

	return undefined as T;
}

interface RequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
	body?: unknown;
}

export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
	const { method = 'GET', body } = options ?? {};

	const response = await fetch(`${API_URL}${path}`, {
		method,
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		credentials: 'include',
		body: body ? JSON.stringify(body) : undefined,
	});

	return handleResponse<T>(response);
}
