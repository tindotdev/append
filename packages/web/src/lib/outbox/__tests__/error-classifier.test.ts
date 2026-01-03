import { describe, expect, it } from 'vitest';
import {
	calculateNextAttemptAt,
	classifyResponse,
	isAuthBlocked,
	isNetworkError,
	isPermanentFailure,
	isRetryableStatus,
} from '../error-classifier';

describe('isNetworkError', () => {
	it('returns true for fetch TypeError', () => {
		const error = new TypeError('fetch failed');
		expect(isNetworkError(error)).toBe(true);
	});

	it('returns true for "Failed to fetch" message', () => {
		const error = new TypeError('Failed to fetch');
		expect(isNetworkError(error)).toBe(true);
	});

	it('returns false for non-TypeError', () => {
		const error = new Error('fetch failed');
		expect(isNetworkError(error)).toBe(false);
	});

	it('returns false for TypeError without fetch in message', () => {
		const error = new TypeError('Cannot read properties of undefined');
		expect(isNetworkError(error)).toBe(false);
	});

	it('returns false for null/undefined', () => {
		expect(isNetworkError(null)).toBe(false);
		expect(isNetworkError(undefined)).toBe(false);
	});
});

describe('isRetryableStatus', () => {
	it('returns true for 408 Request Timeout', () => {
		expect(isRetryableStatus(408)).toBe(true);
	});

	it('returns true for 429 Too Many Requests', () => {
		expect(isRetryableStatus(429)).toBe(true);
	});

	it('returns true for 5xx server errors', () => {
		expect(isRetryableStatus(500)).toBe(true);
		expect(isRetryableStatus(502)).toBe(true);
		expect(isRetryableStatus(503)).toBe(true);
		expect(isRetryableStatus(504)).toBe(true);
		expect(isRetryableStatus(599)).toBe(true);
	});

	it('returns false for success codes', () => {
		expect(isRetryableStatus(200)).toBe(false);
		expect(isRetryableStatus(201)).toBe(false);
		expect(isRetryableStatus(204)).toBe(false);
	});

	it('returns false for client errors', () => {
		expect(isRetryableStatus(400)).toBe(false);
		expect(isRetryableStatus(401)).toBe(false);
		expect(isRetryableStatus(403)).toBe(false);
		expect(isRetryableStatus(404)).toBe(false);
		expect(isRetryableStatus(409)).toBe(false);
		expect(isRetryableStatus(413)).toBe(false);
	});

	it('returns false for 600+ (not valid HTTP)', () => {
		expect(isRetryableStatus(600)).toBe(false);
	});
});

describe('isAuthBlocked', () => {
	it('returns true for 401 Unauthorized', () => {
		expect(isAuthBlocked(401)).toBe(true);
	});

	it('returns true for 403 Forbidden', () => {
		expect(isAuthBlocked(403)).toBe(true);
	});

	it('returns false for other status codes', () => {
		expect(isAuthBlocked(200)).toBe(false);
		expect(isAuthBlocked(400)).toBe(false);
		expect(isAuthBlocked(404)).toBe(false);
		expect(isAuthBlocked(500)).toBe(false);
	});
});

describe('isPermanentFailure', () => {
	it('returns true for 413 Payload Too Large', () => {
		expect(isPermanentFailure(413)).toBe(true);
		expect(isPermanentFailure(413, 'ANY_CODE')).toBe(true);
	});

	it('returns true for 400 + VALIDATION_ERROR', () => {
		expect(isPermanentFailure(400, 'VALIDATION_ERROR')).toBe(true);
	});

	it('returns false for 400 without VALIDATION_ERROR code', () => {
		expect(isPermanentFailure(400)).toBe(false);
		expect(isPermanentFailure(400, 'OTHER_CODE')).toBe(false);
	});

	it('returns true for 409 + IDEMPOTENCY_CONFLICT', () => {
		expect(isPermanentFailure(409, 'IDEMPOTENCY_CONFLICT')).toBe(true);
	});

	it('returns false for 409 without IDEMPOTENCY_CONFLICT code', () => {
		expect(isPermanentFailure(409)).toBe(false);
		expect(isPermanentFailure(409, 'OTHER_CODE')).toBe(false);
	});

	it('returns false for retryable status codes', () => {
		expect(isPermanentFailure(500)).toBe(false);
		expect(isPermanentFailure(503)).toBe(false);
		expect(isPermanentFailure(429)).toBe(false);
	});
});

describe('classifyResponse', () => {
	describe('success cases', () => {
		it('returns success for 201 with batchId', () => {
			expect(classifyResponse(201, undefined, 'batch-123')).toEqual({
				type: 'success',
				batchId: 'batch-123',
			});
		});

		it('returns success for 200 (replay) with batchId', () => {
			expect(classifyResponse(200, undefined, 'batch-456')).toEqual({
				type: 'success',
				batchId: 'batch-456',
			});
		});

		it('returns success with empty batchId if not provided', () => {
			expect(classifyResponse(201)).toEqual({
				type: 'success',
				batchId: '',
			});
		});
	});

	describe('blocked_auth cases', () => {
		it('returns blocked_auth for 401', () => {
			expect(classifyResponse(401)).toEqual({ type: 'blocked_auth' });
		});

		it('returns blocked_auth for 403', () => {
			expect(classifyResponse(403)).toEqual({ type: 'blocked_auth' });
		});
	});

	describe('permanent failure cases', () => {
		it('returns failed for 400 + VALIDATION_ERROR', () => {
			expect(classifyResponse(400, 'VALIDATION_ERROR')).toEqual({ type: 'failed' });
		});

		it('returns failed for 409 + IDEMPOTENCY_CONFLICT', () => {
			expect(classifyResponse(409, 'IDEMPOTENCY_CONFLICT')).toEqual({ type: 'failed' });
		});

		it('returns failed for 413', () => {
			expect(classifyResponse(413)).toEqual({ type: 'failed' });
		});

		it('returns failed for unknown 4xx codes', () => {
			expect(classifyResponse(404)).toEqual({ type: 'failed' });
			expect(classifyResponse(422)).toEqual({ type: 'failed' });
		});
	});

	describe('retry cases', () => {
		it('returns retry for 408', () => {
			expect(classifyResponse(408)).toEqual({ type: 'retry' });
		});

		it('returns retry for 429', () => {
			expect(classifyResponse(429)).toEqual({ type: 'retry' });
		});

		it('returns retry for 500', () => {
			expect(classifyResponse(500)).toEqual({ type: 'retry' });
		});

		it('returns retry for 503', () => {
			expect(classifyResponse(503)).toEqual({ type: 'retry' });
		});
	});
});

describe('calculateNextAttemptAt', () => {
	const now = 1000;

	it('calculates base delay for first attempt (attemptCount=0)', () => {
		const result = calculateNextAttemptAt(now, 0, { jitterFn: () => 0 });
		// 1000 + 1000 * 2^0 = 1000 + 1000 = 2000
		expect(result).toBe(2000);
	});

	it('calculates exponential backoff', () => {
		const jitterFn = () => 0; // No jitter for deterministic test

		// Attempt 0: 1000 * 2^0 = 1000 → now + 1000 = 2000
		expect(calculateNextAttemptAt(now, 0, { jitterFn })).toBe(2000);

		// Attempt 1: 1000 * 2^1 = 2000 → now + 2000 = 3000
		expect(calculateNextAttemptAt(now, 1, { jitterFn })).toBe(3000);

		// Attempt 2: 1000 * 2^2 = 4000 → now + 4000 = 5000
		expect(calculateNextAttemptAt(now, 2, { jitterFn })).toBe(5000);

		// Attempt 3: 1000 * 2^3 = 8000 → now + 8000 = 9000
		expect(calculateNextAttemptAt(now, 3, { jitterFn })).toBe(9000);

		// Attempt 4: 1000 * 2^4 = 16000 → now + 16000 = 17000
		expect(calculateNextAttemptAt(now, 4, { jitterFn })).toBe(17000);

		// Attempt 5: 1000 * 2^5 = 32000 → now + 32000 = 33000
		expect(calculateNextAttemptAt(now, 5, { jitterFn })).toBe(33000);
	});

	it('caps at BACKOFF_CAP_MS (60000)', () => {
		const jitterFn = () => 0;

		// Attempt 6: 1000 * 2^6 = 64000, capped to 60000 → now + 60000 = 61000
		expect(calculateNextAttemptAt(now, 6, { jitterFn })).toBe(61000);

		// Attempt 10: 1000 * 2^10 = 1024000, capped to 60000 → now + 60000 = 61000
		expect(calculateNextAttemptAt(now, 10, { jitterFn })).toBe(61000);
	});

	it('adds jitter', () => {
		// 50% jitter of 250 = 125
		const jitterFn = () => 0.5;

		// Attempt 0: 1000 + 125 = 1125 → now + 1125 = 2125
		expect(calculateNextAttemptAt(now, 0, { jitterFn })).toBe(2125);
	});

	it('uses custom baseMs and capMs', () => {
		const jitterFn = () => 0;

		const result = calculateNextAttemptAt(now, 0, {
			baseMs: 500,
			capMs: 5000,
			jitterFn,
		});
		// 500 * 2^0 = 500 → now + 500 = 1500
		expect(result).toBe(1500);

		const cappedResult = calculateNextAttemptAt(now, 10, {
			baseMs: 500,
			capMs: 5000,
			jitterFn,
		});
		// 500 * 2^10 = 512000, capped to 5000 → now + 5000 = 6000
		expect(cappedResult).toBe(6000);
	});

	it('uses custom jitterMaxMs', () => {
		const jitterFn = () => 1; // 100% jitter

		const result = calculateNextAttemptAt(now, 0, {
			jitterMaxMs: 100,
			jitterFn,
		});
		// 1000 + 100 = 1100 → now + 1100 = 2100
		expect(result).toBe(2100);
	});
});
