import type { Context, Env } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type * as v from 'valibot';

/**
 * Standard API error codes for /api/* routes.
 */
export type ApiErrorCode =
	| 'VALIDATION_ERROR'
	| 'INVALID_JSON'
	| 'PAYLOAD_TOO_LARGE'
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'VERSION_CONFLICT'
	| 'BATCH_NOT_READY'
	| 'IDEMPOTENCY_CONFLICT'
	| 'SERVICE_UNAVAILABLE'
	| 'CONFIGURATION_ERROR'
	| 'INTERNAL_ERROR';

/**
 * Standard API error response shape.
 * All /api/* error responses must use this shape.
 */
export interface ApiErrorResponse {
	error: {
		code: ApiErrorCode;
		message: string;
	};
	/**
	 * Optional structured metadata for clients.
	 * Use sparingly; error responses must always include `error.code` + `error.message`.
	 */
	details?: Record<string, unknown>;
}

/**
 * Return a standardized JSON error response for /api/* routes.
 * Use this helper in all /api/* route handlers to maintain a consistent error contract.
 */
export function apiError<T extends Record<string, unknown>>(
	c: Context<T>,
	status: ContentfulStatusCode,
	code: ApiErrorCode,
	message: string,
	details?: Record<string, unknown>
) {
	return c.json<ApiErrorResponse>({ error: { code, message }, details }, status);
}

/**
 * Validation error hook for vValidator.
 * Returns a standardized 400 error response when validation fails.
 *
 * Usage:
 * ```typescript
 * vValidator('json', Schema, validationHook)
 * ```
 */
export function validationHook<E extends Env>(
	result: { success: boolean; data?: unknown; issues?: v.BaseIssue<unknown>[] },
	c: Context<E>
) {
	if (!result.success) {
		// Get first error message from valibot issues
		const firstIssue = result.issues?.[0];
		const message = firstIssue?.message ?? 'Validation failed';
		return apiError(c, 400, 'VALIDATION_ERROR', message);
	}
}

type ErrorMapping<E extends { type: string }> = {
	[K in E['type']]: {
		status: ContentfulStatusCode;
		code: ApiErrorCode;
		message: string | ((error: Extract<E, { type: K }>) => string);
		details?: Record<string, unknown> | ((error: Extract<E, { type: K }>) => Record<string, unknown> | undefined);
	};
};

/**
 * Map a typed error object to the standard API error response.
 */
export function apiErrorFrom<E extends { type: string }>(c: Context, error: E, mapping: ErrorMapping<E>) {
	const entry = mapping[error.type as E['type']];
	if (!entry) {
		return apiError(c, 500, 'INTERNAL_ERROR', 'Unhandled error');
	}

	const message = typeof entry.message === 'function' ? entry.message(error as Extract<E, { type: E['type'] }>) : entry.message;
	const details = typeof entry.details === 'function' ? entry.details(error as Extract<E, { type: E['type'] }>) : entry.details;

	return apiError(c, entry.status, entry.code, message, details);
}
