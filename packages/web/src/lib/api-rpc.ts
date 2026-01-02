/**
 * Hono RPC client for type-safe API calls.
 *
 * This module provides end-to-end type safety between the API and web packages
 * using Hono's RPC feature.
 */

import type { AppType } from '@append/api';
import { hc, type InferRequestType, type InferResponseType } from 'hono/client';

// API URL - local dev or production
// Exported for use by SSE streaming and blob download functions that can't use RPC
export const API_URL = import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.append.tindev.dev';

/**
 * Typed API client using Hono RPC.
 *
 * Usage:
 * ```typescript
 * const res = await api.api.bucket[':slug'].$get({ param: { slug: 'backend' } });
 * if (res.ok) {
 *   const data = await res.json(); // fully typed!
 * }
 * ```
 */
export const api = hc<AppType>(API_URL, {
	fetch: (input: RequestInfo | URL, init?: RequestInit) =>
		fetch(input, {
			...init,
			credentials: 'include', // Include cookies for authentication
		}),
});

// Re-export type utilities for consumers
export type { InferResponseType, InferRequestType };

/**
 * Error class for API request failures.
 * Used to standardize error handling across the app.
 */
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

/**
 * Helper to handle RPC response and throw typed errors.
 *
 * Usage:
 * ```typescript
 * const res = await api.api.bucket[':slug'].$get({ param: { slug } });
 * const data = await handleRpcResponse(res);
 * ```
 */
interface ApiErrorBody {
	error?: { code?: string; message?: string };
	details?: Record<string, unknown>;
}

export async function buildApiRequestError(
	response: Response,
	options?: { includeDetails?: boolean; includeCurrentVersion?: boolean }
): Promise<ApiRequestError & { currentVersion?: number }> {
	const errorBody = (await response.json()) as ApiErrorBody;
	const error = new ApiRequestError(
		response.status,
		errorBody.error?.code ?? 'UNKNOWN_ERROR',
		errorBody.error?.message ?? response.statusText,
		options?.includeDetails ? errorBody.details : undefined
	);

	if (options?.includeCurrentVersion) {
		const currentVersion = (errorBody.details as { currentVersion?: number } | undefined)?.currentVersion;
		if (typeof currentVersion === 'number') {
			(error as ApiRequestError & { currentVersion?: number }).currentVersion = currentVersion;
		}
	}

	return error;
}

export async function handleRpcResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const contentType = response.headers.get('content-type') || '';
		if (contentType.includes('application/json')) {
			throw await buildApiRequestError(response, { includeDetails: true });
		}
		throw new ApiRequestError(response.status, 'UNKNOWN_ERROR', response.statusText);
	}

	const contentType = response.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return response.json() as Promise<T>;
	}

	return undefined as T;
}
