import { BUCKETS } from '@append/contracts/types';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '@/lib/api-client';
import { getBatch } from '../api/get-batch';
import { generateSuggestions } from '../api/retry-suggestions';
import { updateCandidate } from '../api/update-candidate';
import { BatchHeader, BatchToast, CandidateList, EmptyState, ErrorState, LoadingState } from '../components';
import { useCandidateRowStates } from '../hooks/use-candidate-row-states';
import type { BatchError, BatchResponse, Candidate, SuggestCandidateEvent, UpdateCandidateRequest } from '../types';

const TOAST_TIMEOUT_MS = 5000;

interface PersistMessages {
	failure: string;
	invalid?: (err: ApiRequestError) => string;
}

function getBatchError(err: unknown): BatchError {
	if (err instanceof ApiRequestError) {
		if (err.status === 401) {
			return { status: 401, message: 'Your session has expired. Please sign in again.' };
		}
		if (err.status === 403) {
			return { status: 403, message: "You don't have access to this batch." };
		}
		if (err.status === 404) {
			return { status: 404, message: 'Batch not found.' };
		}
		return { status: err.status, message: 'Something went wrong. Please try again.' };
	}
	return { status: 500, message: 'Something went wrong. Please try again.' };
}

function updateBatchCandidate(batch: BatchResponse | null, candidate: Candidate): BatchResponse | null {
	if (!batch) return batch;
	return {
		...batch,
		candidates: batch.candidates.map((item) => (item.id === candidate.id ? candidate : item)),
	};
}

function applySseEventToCandidate(batch: BatchResponse | null, event: SuggestCandidateEvent): BatchResponse | null {
	if (!batch) return batch;
	return {
		...batch,
		candidates: batch.candidates.map((item) => {
			if (item.id !== event.id) return item;

			// Update candidate based on SSE event status
			if (event.status === 'ok' || event.status === 'cached') {
				return {
					...item,
					suggestedBucket: event.suggestion?.bucket ?? item.suggestedBucket,
					suggestedText: event.suggestion?.text ?? item.suggestedText,
					suggestionStatus: 'done',
					suggestionError: null,
				};
			}
			if (event.status === 'error') {
				return {
					...item,
					suggestionStatus: 'error',
					suggestionError: event.error ?? 'Unknown error',
				};
			}
			if (event.status === 'running') {
				return {
					...item,
					suggestionStatus: 'in_progress',
				};
			}
			return item;
		}),
	};
}

export function BatchDetailPage() {
	const { batchId } = useParams({ from: '/protected/batch/$batchId' });
	const [batch, setBatch] = useState<BatchResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<BatchError | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [isRetrying, setIsRetrying] = useState(false);
	const { rowStates, initialize, updateDraft, markSaving, markError, applyCandidate } = useCandidateRowStates();

	const fetchBatch = useCallback(async () => {
		try {
			const data = await getBatch(batchId);
			setBatch(data);
			initialize(data.candidates);
			setError(null);
		} catch (err) {
			setError(getBatchError(err));
		} finally {
			setIsLoading(false);
		}
	}, [batchId, initialize]);

	useEffect(() => {
		fetchBatch();
	}, [fetchBatch]);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(null), TOAST_TIMEOUT_MS);
		return () => window.clearTimeout(timer);
	}, [toast]);

	const persistCandidate = useCallback(
		async (candidate: Candidate, request: UpdateCandidateRequest, messages: PersistMessages) => {
			const rowState = rowStates[candidate.id];
			if (!rowState || rowState.isSaving) return;

			markSaving(candidate.id);

			try {
				const response = await updateCandidate(candidate.id, request);
				setBatch((prev) => updateBatchCandidate(prev, response.candidate));
				applyCandidate(candidate.id, response.candidate);
			} catch (err) {
				if (err instanceof ApiRequestError) {
					if (err.status === 409) {
						setToast('This row was modified elsewhere. Your changes were not saved.');
						await fetchBatch();
						return;
					}
					if (err.status === 400 && messages.invalid) {
						markError(candidate.id, messages.invalid(err));
						return;
					}
				}
				markError(candidate.id, messages.failure);
			}
		},
		[rowStates, markSaving, applyCandidate, markError, fetchBatch]
	);

	const handleSave = useCallback(
		async (candidate: Candidate) => {
			const rowState = rowStates[candidate.id];
			if (!rowState) return;
			await persistCandidate(
				candidate,
				{
					expectedVersion: candidate.version,
					chosenBucket: rowState.draft.bucket,
					chosenText: rowState.draft.text || null,
				},
				{
					failure: 'Save failed. Please try again.',
					invalid: (err) => `Invalid input: ${err.message}`,
				}
			);
		},
		[persistCandidate, rowStates]
	);

	const handleClearOverrides = useCallback(
		async (candidate: Candidate) => {
			await persistCandidate(
				candidate,
				{
					expectedVersion: candidate.version,
					chosenBucket: null,
					chosenText: null,
				},
				{ failure: 'Clear failed. Please try again.' }
			);
		},
		[persistCandidate]
	);

	const handleGenerateSuggestions = useCallback(async () => {
		setIsRetrying(true);
		let successCount = 0;
		let errorCount = 0;

		try {
			await generateSuggestions(batchId, {
				onCandidate: (event) => {
					setBatch((prev) => applySseEventToCandidate(prev, event));
					if (event.status === 'ok' || event.status === 'cached') successCount++;
					if (event.status === 'error') errorCount++;
				},
				onDone: () => {
					if (errorCount > 0) {
						setToast(`Generated ${successCount} suggestions, ${errorCount} failed`);
					} else if (successCount > 0) {
						setToast(`Generated ${successCount} suggestions`);
					}
				},
				onError: (error) => {
					setToast(`Generation failed: ${error}`);
				},
			});
		} catch {
			setToast('Failed to generate suggestions. Please try again.');
		} finally {
			setIsRetrying(false);
		}
	}, [batchId]);

	const handleRetryFailed = handleGenerateSuggestions;

	if (isLoading) {
		return <LoadingState />;
	}

	if (error) {
		return (
			<ErrorState
				error={error}
				onRetry={() => {
					setIsLoading(true);
					setError(null);
					fetchBatch();
				}}
			/>
		);
	}

	if (!batch) {
		return null;
	}

	if (batch.candidates.length === 0) {
		return <EmptyState />;
	}

	return (
		<div className="max-w-4xl">
			<BatchToast message={toast} />
			<BatchHeader batch={batch} isRetrying={isRetrying} onRetryFailed={handleRetryFailed} onGenerateSuggestions={handleGenerateSuggestions} />
			<CandidateList
				candidates={batch.candidates}
				rowStates={rowStates}
				buckets={BUCKETS}
				onDraftChange={updateDraft}
				onSave={handleSave}
				onClear={handleClearOverrides}
			/>
			<div className="mt-6 flex gap-4">
				<Link to="/batch" className="text-zinc-400 hover:text-white transition-colors">
					&larr; View all batches
				</Link>
				<Link to="/batch/new" className="text-zinc-400 hover:text-white transition-colors">
					Create another batch
				</Link>
			</div>
		</div>
	);
}
