/**
 * Error classification and retry backoff helpers.
 *
 * Classifies API responses into actionable categories:
 * - success: 200/201 → delete item, broadcast result
 * - retry: network errors, 408, 429, 500-599 → schedule retry with backoff
 * - blocked_auth: 401/403 → pause until auth resumes
 * - failed: 400 VALIDATION_ERROR, 409 IDEMPOTENCY_CONFLICT, 413 → permanent failure
 */

import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, JITTER_RANGE_MS } from './constants';

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Check if an error is a network error (fetch failed without response).
 */
export function isNetworkError(error: unknown): boolean {
	return error instanceof TypeError && error.message.includes('fetch');
}

/**
 * Check if an HTTP status code indicates a retryable error.
 * Retryable: 408 Request Timeout, 429 Too Many Requests, 500-599 Server Errors
 */
export function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * Check if an HTTP status code indicates an auth-blocked error.
 * Auth blocked: 401 Unauthorized, 403 Forbidden
 */
export function isAuthBlocked(status: number): boolean {
	return status === 401 || status === 403;
}

/**
 * Check if a response indicates a permanent failure (should not retry).
 * Permanent: 400 + VALIDATION_ERROR, 409 + IDEMPOTENCY_CONFLICT, 413
 */
export function isPermanentFailure(status: number, code?: string): boolean {
	if (status === 413) return true;
	if (status === 400 && code === 'VALIDATION_ERROR') return true;
	if (status === 409 && code === 'IDEMPOTENCY_CONFLICT') return true;
	return false;
}

// =============================================================================
// Response Classification
// =============================================================================

/**
 * Classified response type.
 */
export type ClassifiedResponse = { type: 'success'; batchId: string } | { type: 'retry' } | { type: 'blocked_auth' } | { type: 'failed' };

/**
 * Classify an API response into an actionable category.
 *
 * @param status - HTTP status code
 * @param code - API error code (if available)
 * @param batchId - Batch ID from successful response (if available)
 */
export function classifyResponse(status: number, code?: string, batchId?: string): ClassifiedResponse {
	// Success: 200 (replay) or 201 (created)
	if (status === 200 || status === 201) {
		return { type: 'success', batchId: batchId ?? '' };
	}

	// Blocked auth
	if (isAuthBlocked(status)) {
		return { type: 'blocked_auth' };
	}

	// Permanent failure
	if (isPermanentFailure(status, code)) {
		return { type: 'failed' };
	}

	// Retryable
	if (isRetryableStatus(status)) {
		return { type: 'retry' };
	}

	// Unknown status - treat as permanent failure for safety
	// This includes 4xx errors that aren't explicitly handled
	return { type: 'failed' };
}

// =============================================================================
// Backoff Calculation
// =============================================================================

/**
 * Options for backoff calculation.
 */
export interface BackoffOptions {
	/** Base delay in ms (default: BACKOFF_BASE_MS) */
	baseMs?: number;
	/** Maximum delay cap in ms (default: BACKOFF_CAP_MS) */
	capMs?: number;
	/** Jitter range in ms (default: JITTER_RANGE_MS) */
	jitterMaxMs?: number;
	/** Jitter function returning 0-1 (default: Math.random) */
	jitterFn?: () => number;
}

/**
 * Calculate the next attempt timestamp using exponential backoff with cap and jitter.
 *
 * Formula: now + min(base * 2^attempt, cap) + jitter
 *
 * @param now - Current timestamp in ms
 * @param attemptCount - Number of attempts already made (0 = first attempt)
 * @param options - Backoff configuration
 * @returns Timestamp for next attempt in ms
 */
export function calculateNextAttemptAt(now: number, attemptCount: number, options: BackoffOptions = {}): number {
	const { baseMs = BACKOFF_BASE_MS, capMs = BACKOFF_CAP_MS, jitterMaxMs = JITTER_RANGE_MS, jitterFn = Math.random } = options;

	// Exponential delay: base * 2^attempt, capped at capMs
	const exponentialDelay = Math.min(baseMs * 2 ** attemptCount, capMs);

	// Add random jitter
	const jitter = Math.floor(jitterFn() * jitterMaxMs);

	return now + exponentialDelay + jitter;
}
