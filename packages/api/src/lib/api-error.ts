import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Standard API error codes for /api/* routes.
 * Keep in sync with PLAN_step2-batch-input.md §4.0.
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
