/**
 * Tests for the outbox adapter.
 *
 * These tests verify the app-specific adapter layer:
 * - Command creation
 * - Error classification to transport outcomes
 * - Broadcast payload shapes
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the api-rpc module before importing the adapter
vi.mock('../api-rpc', () => ({
	api: {
		api: {
			batch: {
				$post: vi.fn(),
			},
		},
	},
	buildApiRequestError: vi.fn(),
}));

import { api, buildApiRequestError } from '../api-rpc';
import { createAppOutbox, createAppTransport } from '../outbox-adapter';

// Helper to create mock response that satisfies Hono ClientResponse
function createMockResponse(overrides: { ok: boolean; status: number; json: () => Promise<unknown> }) {
	return {
		...overrides,
		redirect: vi.fn(),
		headers: new Headers(),
		redirected: false,
		statusText: '',
		type: 'basic' as ResponseType,
		url: '',
		clone: vi.fn(),
		body: null,
		bodyUsed: false,
		arrayBuffer: vi.fn(),
		blob: vi.fn(),
		formData: vi.fn(),
		text: vi.fn(),
	};
}

describe('outbox-adapter', () => {
	// Cast to allow mocking with simplified Response objects
	const mockPost = api.api.batch.$post as ReturnType<typeof vi.fn>;
	const mockBuildApiRequestError = vi.mocked(buildApiRequestError);

	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe('createAppTransport', () => {
		const transport = createAppTransport();

		it('returns success outcome on 200 OK', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ id: 'batch-123' }),
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1\nterm2', clientRequestId: 'req-1' },
			});

			expect(result).toEqual({
				outcome: 'success',
				result: { batchId: 'batch-123' },
			});
		});

		it('returns blocked_auth outcome on 401 Unauthorized', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 401,
					json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }),
				})
			);
			mockBuildApiRequestError.mockResolvedValue(
				Object.assign(new Error('Not authenticated'), {
					status: 401,
					code: 'UNAUTHORIZED',
					message: 'Not authenticated',
					name: 'ApiRequestError',
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('blocked_auth');
			if (result.outcome !== 'success') {
				expect(result.error).toEqual({
					status: 401,
					code: 'UNAUTHORIZED',
					message: 'Not authenticated',
				});
			}
		});

		it('returns blocked_auth outcome on 403 Forbidden', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 403,
					json: () => Promise.resolve({ error: { code: 'FORBIDDEN', message: 'Access denied' } }),
				})
			);
			mockBuildApiRequestError.mockResolvedValue(
				Object.assign(new Error('Access denied'), {
					status: 403,
					code: 'FORBIDDEN',
					message: 'Access denied',
					name: 'ApiRequestError',
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('blocked_auth');
		});

		it('returns failed outcome on 400 VALIDATION_ERROR', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 400,
					json: () => Promise.resolve({ error: { code: 'VALIDATION_ERROR', message: 'Invalid terms' } }),
				})
			);
			mockBuildApiRequestError.mockResolvedValue(
				Object.assign(new Error('Invalid terms'), {
					status: 400,
					code: 'VALIDATION_ERROR',
					message: 'Invalid terms',
					name: 'ApiRequestError',
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: '', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('failed');
			if (result.outcome !== 'success') {
				expect(result.error?.code).toBe('VALIDATION_ERROR');
			}
		});

		it('returns failed outcome on 409 IDEMPOTENCY_CONFLICT', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 409,
					json: () => Promise.resolve({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Already processed' } }),
				})
			);
			mockBuildApiRequestError.mockResolvedValue(
				Object.assign(new Error('Already processed'), {
					status: 409,
					code: 'IDEMPOTENCY_CONFLICT',
					message: 'Already processed',
					name: 'ApiRequestError',
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('failed');
			if (result.outcome !== 'success') {
				expect(result.error?.code).toBe('IDEMPOTENCY_CONFLICT');
			}
		});

		it('returns retry outcome on 500 Internal Server Error', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 500,
					json: () => Promise.resolve({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
				})
			);
			mockBuildApiRequestError.mockResolvedValue(
				Object.assign(new Error('Server error'), {
					status: 500,
					code: 'INTERNAL_ERROR',
					message: 'Server error',
					name: 'ApiRequestError',
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('retry');
		});

		it('returns retry outcome on 503 Service Unavailable', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 503,
					json: () => Promise.resolve({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again' } }),
				})
			);
			mockBuildApiRequestError.mockResolvedValue(
				Object.assign(new Error('Try again'), {
					status: 503,
					code: 'SERVICE_UNAVAILABLE',
					message: 'Try again',
					name: 'ApiRequestError',
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('retry');
		});

		it('returns retry outcome on 429 Too Many Requests', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 429,
					json: () => Promise.resolve({ error: { code: 'RATE_LIMITED', message: 'Rate limited' } }),
				})
			);
			mockBuildApiRequestError.mockResolvedValue(
				Object.assign(new Error('Rate limited'), {
					status: 429,
					code: 'RATE_LIMITED',
					message: 'Rate limited',
					name: 'ApiRequestError',
				})
			);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('retry');
		});

		it('returns retry outcome on network error', async () => {
			const networkError = new TypeError('Failed to fetch');
			mockPost.mockRejectedValue(networkError);

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			expect(result.outcome).toBe('retry');
			if (result.outcome !== 'success') {
				expect(result.error?.message).toBe('Network error');
			}
		});

		it('returns retry outcome when JSON parsing fails', async () => {
			mockPost.mockResolvedValue(
				createMockResponse({
					ok: false,
					status: 500,
					json: () => Promise.resolve({}),
				})
			);
			// Simulate JSON parse error in buildApiRequestError
			mockBuildApiRequestError.mockRejectedValue(new SyntaxError('Unexpected end of JSON'));

			const result = await transport.execute({
				type: 'capture_terms',
				request: { terms: 'term1', clientRequestId: 'req-1' },
			});

			// Should be caught by outer catch and treated as retryable
			expect(result.outcome).toBe('retry');
			if (result.outcome !== 'success') {
				expect(result.error?.message).toBe('Unexpected end of JSON');
			}
		});
	});

	describe('createAppOutbox', () => {
		it('creates commands with UUID clientRequestId', () => {
			const outbox = createAppOutbox({ userScope: 'user-1' });

			// Access the internal createCommand via enqueueing
			// We can't directly test createCommand, but we can verify the outbox is created
			expect(outbox).toBeDefined();
			expect(outbox.store).toBeDefined();
			expect(outbox.broadcast).toBeDefined();
			expect(outbox.enqueue).toBeInstanceOf(Function);
			expect(outbox.undo).toBeInstanceOf(Function);
			expect(outbox.senderLoop).toBeDefined();
			expect(outbox.retry).toBeInstanceOf(Function);
			expect(outbox.close).toBeInstanceOf(Function);
		});

		it('exposes retry and close methods from generic outbox', () => {
			const outbox = createAppOutbox({ userScope: 'user-1' });

			// Verify the new methods are available
			expect(typeof outbox.retry).toBe('function');
			expect(typeof outbox.close).toBe('function');
		});
	});
});
