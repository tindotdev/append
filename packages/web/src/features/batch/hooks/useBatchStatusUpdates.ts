import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { batchKeys } from '../api/get-batch';
import { generateSuggestions } from '../api/retry-suggestions';
import type { SuggestCandidateEvent, SuggestDoneEvent, SuggestStartEvent } from '../types';

export interface BatchProgress {
	batchId: string;
	total: number;
	processed: number;
	succeeded: number;
	failed: number;
	status: 'active' | 'completed' | 'error';
}

export interface BatchStatusUpdatesOptions {
	/**
	 * Called when batch processing starts
	 */
	onStart?: (batchId: string, event: SuggestStartEvent) => void;

	/**
	 * Called for each candidate progress update
	 */
	onProgress?: (batchId: string, progress: BatchProgress) => void;

	/**
	 * Called when batch processing completes
	 */
	onComplete?: (batchId: string, event: SuggestDoneEvent) => void;

	/**
	 * Called when batch processing fails
	 */
	onError?: (batchId: string, error: string) => void;

	/**
	 * Whether to automatically show toast notifications
	 * @default true
	 */
	showToasts?: boolean;

	/**
	 * Whether to automatically invalidate batch list queries on completion
	 * @default true
	 */
	autoRefresh?: boolean;
}

/**
 * Hook for managing real-time batch status updates via SSE.
 *
 * Monitors suggestion generation progress for one or more batches and provides
 * real-time progress callbacks. Automatically cleans up SSE connections.
 *
 * @example
 * ```tsx
 * const { trackBatch, untrackBatch, progress, isTracking } = useBatchStatusUpdates({
 *   onProgress: (batchId, progress) => {
 *     console.log(`Batch ${batchId}: ${progress.processed}/${progress.total}`);
 *   },
 *   onComplete: (batchId, event) => {
 *     console.log(`Batch ${batchId} completed: ${event.ok} succeeded`);
 *   }
 * });
 *
 * // Start tracking a batch
 * await trackBatch('batch-123');
 * ```
 */
export function useBatchStatusUpdates(options: BatchStatusUpdatesOptions = {}) {
	const { onStart, onProgress, onComplete, onError, showToasts = true, autoRefresh = true } = options;

	const queryClient = useQueryClient();

	// Track active batch processes
	const [trackedBatches, setTrackedBatches] = useState<Set<string>>(new Set());
	const [batchProgress, setBatchProgress] = useState<Map<string, BatchProgress>>(new Map());

	// Use refs to avoid recreating abort controllers in effect and to prevent stale closure issues
	const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
	const progressRef = useRef<Map<string, BatchProgress>>(new Map());
	const trackingRef = useRef<Set<string>>(new Set());

	// Keep progress ref in sync
	useEffect(() => {
		progressRef.current = batchProgress;
	}, [batchProgress]);

	/**
	 * Start tracking a batch's suggestion generation progress
	 */
	const trackBatch = useCallback(
		async (batchId: string): Promise<void> => {
			// Skip if already tracking (use ref to avoid stale closure)
			if (trackingRef.current.has(batchId)) {
				return;
			}

			// Add to tracked set immediately
			trackingRef.current.add(batchId);
			setTrackedBatches((prev) => new Set(prev).add(batchId));

			// Create abort controller for this batch
			const abortController = new AbortController();
			abortControllersRef.current.set(batchId, abortController);

			// Initialize progress
			const initialProgress: BatchProgress = {
				batchId,
				total: 0,
				processed: 0,
				succeeded: 0,
				failed: 0,
				status: 'active',
			};
			setBatchProgress((prev) => new Map(prev).set(batchId, initialProgress));

			try {
				await generateSuggestions(
					batchId,
					{
						onStart: (event: SuggestStartEvent) => {
							const updatedProgress: BatchProgress = {
								batchId,
								total: event.eligibleCount,
								processed: 0,
								succeeded: 0,
								failed: 0,
								status: 'active',
							};
							setBatchProgress((prev) => new Map(prev).set(batchId, updatedProgress));
							onStart?.(batchId, event);
						},

						onCandidate: (event: SuggestCandidateEvent) => {
							setBatchProgress((prev) => {
								const current = prev.get(batchId) || initialProgress;
								const updated: BatchProgress = {
									...current,
									processed: current.processed + 1,
									succeeded: event.status === 'ok' || event.status === 'cached' ? current.succeeded + 1 : current.succeeded,
									failed: event.status === 'error' ? current.failed + 1 : current.failed,
								};

								// Call progress callback
								onProgress?.(batchId, updated);

								return new Map(prev).set(batchId, updated);
							});
						},

						onDone: (event: SuggestDoneEvent) => {
							setBatchProgress((prev) => {
								const current = prev.get(batchId) || initialProgress;
								const updated: BatchProgress = {
									...current,
									status: 'completed',
								};
								return new Map(prev).set(batchId, updated);
							});

							// Show toast notification
							if (showToasts) {
								if (event.failed > 0) {
									toast.warning(`Batch completed: ${event.ok + event.cached} succeeded, ${event.failed} failed`);
								} else if (event.ok + event.cached > 0) {
									toast.success(`Batch completed: ${event.ok + event.cached} suggestions generated`);
								} else {
									toast.info('Batch completed: no suggestions generated');
								}
							}

							// Call completion callback
							onComplete?.(batchId, event);

							// Auto-refresh batch list
							if (autoRefresh) {
								void queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
							}

							// Clean up tracking
							trackingRef.current.delete(batchId);
							setTrackedBatches((prev) => {
								const next = new Set(prev);
								next.delete(batchId);
								return next;
							});
							abortControllersRef.current.delete(batchId);
						},

						onError: (error: string) => {
							setBatchProgress((prev) => {
								const current = prev.get(batchId) || initialProgress;
								const updated: BatchProgress = {
									...current,
									status: 'error',
								};
								return new Map(prev).set(batchId, updated);
							});

							// Show error toast
							if (showToasts) {
								toast.error(`Batch failed: ${error}`);
							}

							// Call error callback
							onError?.(batchId, error);

							// Clean up tracking
							trackingRef.current.delete(batchId);
							setTrackedBatches((prev) => {
								const next = new Set(prev);
								next.delete(batchId);
								return next;
							});
							abortControllersRef.current.delete(batchId);
						},
					},
					abortController.signal
				);
			} catch (err) {
				// Handle unexpected errors
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';

				setBatchProgress((prev) => {
					const current = prev.get(batchId) || initialProgress;
					const updated: BatchProgress = {
						...current,
						status: 'error',
					};
					return new Map(prev).set(batchId, updated);
				});

				if (showToasts) {
					toast.error(`Failed to track batch: ${errorMessage}`);
				}

				onError?.(batchId, errorMessage);

				// Clean up
				trackingRef.current.delete(batchId);
				setTrackedBatches((prev) => {
					const next = new Set(prev);
					next.delete(batchId);
					return next;
				});
				abortControllersRef.current.delete(batchId);
			}
		},
		[onStart, onProgress, onComplete, onError, showToasts, autoRefresh, queryClient]
	);

	/**
	 * Stop tracking a batch (aborts the SSE connection)
	 */
	const untrackBatch = useCallback((batchId: string) => {
		// Abort the SSE connection
		const controller = abortControllersRef.current.get(batchId);
		if (controller) {
			controller.abort();
			abortControllersRef.current.delete(batchId);
		}

		// Remove from tracking
		trackingRef.current.delete(batchId);
		setTrackedBatches((prev) => {
			const next = new Set(prev);
			next.delete(batchId);
			return next;
		});

		// Remove progress
		setBatchProgress((prev) => {
			const next = new Map(prev);
			next.delete(batchId);
			return next;
		});
	}, []);

	/**
	 * Get progress for a specific batch
	 */
	const getProgress = useCallback(
		(batchId: string): BatchProgress | undefined => {
			return batchProgress.get(batchId);
		},
		[batchProgress]
	);

	/**
	 * Check if a batch is currently being tracked
	 */
	const isTracking = useCallback(
		(batchId: string): boolean => {
			return trackedBatches.has(batchId);
		},
		[trackedBatches]
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			// Abort all active connections
			for (const controller of abortControllersRef.current.values()) {
				controller.abort();
			}
			abortControllersRef.current.clear();
		};
	}, []);

	return {
		/** Start tracking a batch */
		trackBatch,
		/** Stop tracking a batch */
		untrackBatch,
		/** Get progress for a batch */
		getProgress,
		/** Check if a batch is being tracked */
		isTracking,
		/** All currently tracked batch IDs */
		trackedBatches: Array.from(trackedBatches),
		/** Progress map for all tracked batches */
		progress: batchProgress,
	};
}
