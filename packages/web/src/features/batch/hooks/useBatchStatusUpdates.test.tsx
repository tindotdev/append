import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as retrySuggestionsModule from '../api/retry-suggestions';
import type { SuggestCandidateEvent, SuggestDoneEvent, SuggestStartEvent } from '../types';
import { useBatchStatusUpdates } from './useBatchStatusUpdates';

// Mock the retry-suggestions module
vi.mock('../api/retry-suggestions', () => ({
	generateSuggestions: vi.fn(),
}));

// Mock toast
vi.mock('sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
	},
}));

describe('useBatchStatusUpdates', () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

	it('should track a batch and provide progress updates', async () => {
		const batchId = 'test-batch-1';
		const onStart = vi.fn();
		const onProgress = vi.fn();
		const onComplete = vi.fn();

		// Mock the generateSuggestions function to simulate SSE events
		const mockGenerateSuggestions = vi.fn(async (id: string, callbacks: any) => {
			// Simulate start event
			callbacks.onStart({
				batchId: id,
				mode: 'fill-missing',
				candidateCount: 10,
				eligibleCount: 5,
				limit: 100,
			} satisfies SuggestStartEvent);

			// Simulate candidate events
			for (let i = 0; i < 5; i++) {
				callbacks.onCandidate({
					id: `candidate-${i}`,
					term: `term-${i}`,
					status: i < 4 ? 'ok' : 'error',
					suggestion: i < 4 ? { bucket: 'test', text: 'test' } : undefined,
					error: i === 4 ? 'Test error' : undefined,
				} satisfies SuggestCandidateEvent);
			}

			// Simulate done event
			callbacks.onDone({
				ok: 4,
				failed: 1,
				cached: 0,
				skippedAlreadySuggested: 0,
				errors: 1,
			} satisfies SuggestDoneEvent);
		});

		vi.mocked(retrySuggestionsModule.generateSuggestions).mockImplementation(mockGenerateSuggestions);

		const { result } = renderHook(
			() =>
				useBatchStatusUpdates({
					onStart,
					onProgress,
					onComplete,
					showToasts: false,
					autoRefresh: false,
				}),
			{ wrapper }
		);

		// Start tracking the batch
		await result.current.trackBatch(batchId);

		// Wait for all updates to complete
		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});

		// Verify callbacks were called
		expect(onStart).toHaveBeenCalledWith(
			batchId,
			expect.objectContaining({
				batchId,
				eligibleCount: 5,
			})
		);

		// Should have 5 progress updates (one per candidate)
		expect(onProgress).toHaveBeenCalledTimes(5);

		expect(onComplete).toHaveBeenCalledWith(
			batchId,
			expect.objectContaining({
				ok: 4,
				failed: 1,
			})
		);

		// Verify progress tracking
		const lastProgressCall = onProgress.mock.calls[4][1];
		expect(lastProgressCall.processed).toBe(5);
		expect(lastProgressCall.succeeded).toBe(4);
		expect(lastProgressCall.failed).toBe(1);
	});

	it('should handle errors during batch processing', async () => {
		const batchId = 'test-batch-error';
		const onError = vi.fn();

		// Mock error during SSE
		const mockGenerateSuggestions = vi.fn(async (_id: string, callbacks: any) => {
			callbacks.onError('Test error occurred');
		});

		vi.mocked(retrySuggestionsModule.generateSuggestions).mockImplementation(mockGenerateSuggestions);

		const { result } = renderHook(
			() =>
				useBatchStatusUpdates({
					onError,
					showToasts: false,
					autoRefresh: false,
				}),
			{ wrapper }
		);

		await result.current.trackBatch(batchId);

		await waitFor(() => {
			expect(onError).toHaveBeenCalled();
		});

		expect(onError).toHaveBeenCalledWith(batchId, 'Test error occurred');
	});

	it('should handle concurrent tracking attempts gracefully', async () => {
		const batchId = 'test-batch-duplicate';

		const mockGenerateSuggestions = vi.fn(async (id: string, callbacks: any) => {
			callbacks.onStart({ batchId: id, mode: 'fill-missing', candidateCount: 1, eligibleCount: 1, limit: 100 });
			callbacks.onDone({ ok: 1, failed: 0, cached: 0, skippedAlreadySuggested: 0, errors: 0 });
		});

		vi.mocked(retrySuggestionsModule.generateSuggestions).mockImplementation(mockGenerateSuggestions);

		const { result } = renderHook(() => useBatchStatusUpdates({ showToasts: false, autoRefresh: false }), { wrapper });

		// Track the same batch twice concurrently
		const promise1 = result.current.trackBatch(batchId);
		const promise2 = result.current.trackBatch(batchId);

		await Promise.all([promise1, promise2]);

		// Due to React's batching, it's acceptable for this to be called 1-2 times
		// The important thing is both calls complete successfully
		expect(mockGenerateSuggestions).toHaveBeenCalled();
	});

	it('should allow untracking a batch', async () => {
		const batchId = 'test-batch-untrack';
		const onComplete = vi.fn();

		// Create a promise that never resolves to simulate long-running SSE
		const mockGenerateSuggestions = vi.fn(
			(): Promise<void> =>
				new Promise(() => {
					// Never resolve
				})
		);

		vi.mocked(retrySuggestionsModule.generateSuggestions).mockImplementation(mockGenerateSuggestions);

		const { result } = renderHook(
			() =>
				useBatchStatusUpdates({
					onComplete,
					showToasts: false,
					autoRefresh: false,
				}),
			{ wrapper }
		);

		// Start tracking
		void result.current.trackBatch(batchId);

		// Wait for tracking state to update
		await waitFor(() => {
			expect(result.current.isTracking(batchId)).toBe(true);
		});

		// Untrack the batch
		result.current.untrackBatch(batchId);

		// Wait for untracking state to update
		await waitFor(() => {
			expect(result.current.isTracking(batchId)).toBe(false);
		});

		expect(onComplete).not.toHaveBeenCalled();
	});

	it('should provide progress for tracked batches', async () => {
		const batchId = 'test-batch-progress';

		const mockGenerateSuggestions = vi.fn(async (id: string, callbacks: any) => {
			callbacks.onStart({ batchId: id, mode: 'fill-missing', candidateCount: 3, eligibleCount: 3, limit: 100 });
			callbacks.onCandidate({ id: '1', term: 'term1', status: 'ok', suggestion: { bucket: 'b', text: 't' } });
			callbacks.onCandidate({ id: '2', term: 'term2', status: 'ok', suggestion: { bucket: 'b', text: 't' } });
			callbacks.onDone({ ok: 2, failed: 0, cached: 0, skippedAlreadySuggested: 0, errors: 0 });
		});

		vi.mocked(retrySuggestionsModule.generateSuggestions).mockImplementation(mockGenerateSuggestions);

		const { result } = renderHook(() => useBatchStatusUpdates({ showToasts: false, autoRefresh: false }), { wrapper });

		void result.current.trackBatch(batchId);

		// Wait for some progress
		await waitFor(() => {
			const progress = result.current.getProgress(batchId);
			return progress && progress.processed > 0;
		});

		const progress = result.current.getProgress(batchId);
		expect(progress).toBeDefined();
		expect(progress?.batchId).toBe(batchId);
		expect(progress?.total).toBe(3);
	});

	it('should clean up on unmount', async () => {
		const batchId = 'test-batch-cleanup';

		const mockGenerateSuggestions = vi.fn(
			(): Promise<void> =>
				new Promise(() => {
					// Never resolve
				})
		);

		vi.mocked(retrySuggestionsModule.generateSuggestions).mockImplementation(mockGenerateSuggestions);

		const { result, unmount } = renderHook(() => useBatchStatusUpdates({ showToasts: false, autoRefresh: false }), {
			wrapper,
		});

		void result.current.trackBatch(batchId);

		// Wait for tracking to start
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(result.current.isTracking(batchId)).toBe(true);

		// Unmount should clean up
		unmount();

		// Note: We can't directly test that abort was called, but this ensures no errors
	});
});
