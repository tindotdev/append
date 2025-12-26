import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, type BatchResponse, type Bucket, type Candidate, getBatch, updateCandidate } from '../lib/api';

const BUCKETS: Bucket[] = ['foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'];

interface CandidateDraft {
	bucket: Bucket | null;
	text: string;
}

interface CandidateRowState {
	draft: CandidateDraft;
	isSaving: boolean;
	error: string | null;
	showSuccess: boolean;
}

export function BatchDetailPage() {
	const { batchId } = useParams({ from: '/protected/batch/$batchId' });
	const [batch, setBatch] = useState<BatchResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<{ status: number; message: string } | null>(null);
	const [toast, setToast] = useState<string | null>(null);

	// Per-candidate row state keyed by candidate.id
	const [rowStates, setRowStates] = useState<Record<string, CandidateRowState>>({});

	const initializeRowStates = useCallback((candidates: Candidate[]) => {
		const states: Record<string, CandidateRowState> = {};
		for (const cand of candidates) {
			states[cand.id] = {
				draft: {
					bucket: cand.chosenBucket ?? cand.suggestedBucket,
					text: cand.chosenText ?? cand.suggestedText ?? '',
				},
				isSaving: false,
				error: null,
				showSuccess: false,
			};
		}
		setRowStates(states);
	}, []);

	const fetchBatch = useCallback(async () => {
		try {
			const data = await getBatch(batchId);
			setBatch(data);
			initializeRowStates(data.candidates);
			setError(null);
		} catch (err) {
			if (err instanceof ApiRequestError) {
				if (err.status === 401) {
					setError({ status: 401, message: 'Your session has expired. Please sign in again.' });
				} else if (err.status === 403) {
					setError({ status: 403, message: "You don't have access to this batch." });
				} else if (err.status === 404) {
					setError({ status: 404, message: 'Batch not found.' });
				} else {
					setError({ status: err.status, message: 'Something went wrong. Please try again.' });
				}
			} else {
				setError({ status: 500, message: 'Something went wrong. Please try again.' });
			}
		} finally {
			setIsLoading(false);
		}
	}, [batchId, initializeRowStates]);

	useEffect(() => {
		fetchBatch();
	}, [fetchBatch]);

	// Show toast for a few seconds then hide
	useEffect(() => {
		if (toast) {
			const timer = setTimeout(() => setToast(null), 5000);
			return () => clearTimeout(timer);
		}
	}, [toast]);

	const updateRowDraft = (candidateId: string, updates: Partial<CandidateDraft>) => {
		setRowStates((prev) => ({
			...prev,
			[candidateId]: {
				...prev[candidateId],
				draft: { ...prev[candidateId].draft, ...updates },
				error: null,
			},
		}));
	};

	const handleSave = async (cand: Candidate) => {
		const rowState = rowStates[cand.id];
		if (!rowState || rowState.isSaving) return;

		setRowStates((prev) => ({
			...prev,
			[cand.id]: { ...prev[cand.id], isSaving: true, error: null },
		}));

		try {
			const response = await updateCandidate(cand.id, {
				expectedVersion: cand.version,
				chosenBucket: rowState.draft.bucket,
				chosenText: rowState.draft.text || null,
			});

			// Update batch state with new candidate data
			setBatch((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					candidates: prev.candidates.map((c) => (c.id === cand.id ? response.candidate : c)),
				};
			});

			// Update row state - show success briefly
			setRowStates((prev) => ({
				...prev,
				[cand.id]: {
					...prev[cand.id],
					isSaving: false,
					showSuccess: true,
					draft: {
						bucket: response.candidate.chosenBucket ?? response.candidate.suggestedBucket,
						text: response.candidate.chosenText ?? response.candidate.suggestedText ?? '',
					},
				},
			}));

			// Hide success indicator after 1s
			setTimeout(() => {
				setRowStates((prev) => ({
					...prev,
					[cand.id]: { ...prev[cand.id], showSuccess: false },
				}));
			}, 1000);
		} catch (err) {
			if (err instanceof ApiRequestError) {
				if (err.status === 409) {
					// Version conflict - re-fetch batch and show toast
					setToast('This row was modified elsewhere. Your changes were not saved.');
					await fetchBatch();
				} else if (err.status === 400) {
					setRowStates((prev) => ({
						...prev,
						[cand.id]: {
							...prev[cand.id],
							isSaving: false,
							error: `Invalid input: ${err.message}`,
						},
					}));
				} else {
					setRowStates((prev) => ({
						...prev,
						[cand.id]: {
							...prev[cand.id],
							isSaving: false,
							error: 'Save failed. Please try again.',
						},
					}));
				}
			} else {
				setRowStates((prev) => ({
					...prev,
					[cand.id]: {
						...prev[cand.id],
						isSaving: false,
						error: 'Save failed. Please try again.',
					},
				}));
			}
		}
	};

	const handleClearOverrides = async (cand: Candidate) => {
		const rowState = rowStates[cand.id];
		if (!rowState || rowState.isSaving) return;

		setRowStates((prev) => ({
			...prev,
			[cand.id]: { ...prev[cand.id], isSaving: true, error: null },
		}));

		try {
			const response = await updateCandidate(cand.id, {
				expectedVersion: cand.version,
				chosenBucket: null,
				chosenText: null,
			});

			// Update batch state with new candidate data
			setBatch((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					candidates: prev.candidates.map((c) => (c.id === cand.id ? response.candidate : c)),
				};
			});

			// Reset draft to suggested values
			setRowStates((prev) => ({
				...prev,
				[cand.id]: {
					...prev[cand.id],
					isSaving: false,
					showSuccess: true,
					draft: {
						bucket: response.candidate.suggestedBucket,
						text: response.candidate.suggestedText ?? '',
					},
				},
			}));

			// Hide success indicator after 1s
			setTimeout(() => {
				setRowStates((prev) => ({
					...prev,
					[cand.id]: { ...prev[cand.id], showSuccess: false },
				}));
			}, 1000);
		} catch (err) {
			if (err instanceof ApiRequestError) {
				if (err.status === 409) {
					setToast('This row was modified elsewhere. Your changes were not saved.');
					await fetchBatch();
				} else {
					setRowStates((prev) => ({
						...prev,
						[cand.id]: {
							...prev[cand.id],
							isSaving: false,
							error: 'Clear failed. Please try again.',
						},
					}));
				}
			} else {
				setRowStates((prev) => ({
					...prev,
					[cand.id]: {
						...prev[cand.id],
						isSaving: false,
						error: 'Clear failed. Please try again.',
					},
				}));
			}
		}
	};

	// Loading state
	if (isLoading) {
		return (
			<div className="max-w-4xl flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
			</div>
		);
	}

	// Error states
	if (error) {
		const is5xx = error.status >= 500;
		return (
			<div className="max-w-4xl">
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-zinc-400">{error.message}</p>
					{is5xx && (
						<button
							onClick={() => {
								setIsLoading(true);
								setError(null);
								fetchBatch();
							}}
							className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors"
						>
							Retry
						</button>
					)}
				</div>
				<Link to="/batch/new" className="mt-4 inline-block text-zinc-400 hover:text-white transition-colors">
					← Create new batch
				</Link>
			</div>
		);
	}

	if (!batch) {
		return null;
	}

	// Empty state
	if (batch.candidates.length === 0) {
		return (
			<div className="max-w-4xl">
				<h2 className="text-xl font-semibold">Review Batch</h2>
				<div className="mt-6 flex flex-col items-center justify-center py-12 text-center">
					<p className="text-zinc-400">No candidates in this batch.</p>
				</div>
				<Link to="/batch/new" className="mt-6 inline-block text-zinc-400 hover:text-white transition-colors">
					← Create another batch
				</Link>
			</div>
		);
	}

	return (
		<div className="max-w-4xl">
			{/* Toast */}
			{toast && (
				<div className="fixed top-4 right-4 z-50 px-4 py-3 bg-amber-900/90 border border-amber-700 rounded-lg text-amber-200 shadow-lg">
					{toast}
				</div>
			)}

			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">Review Batch</h2>
				<span className="text-sm text-zinc-500">
					{batch.candidateCount} candidate{batch.candidateCount !== 1 ? 's' : ''}
				</span>
			</div>

			<div className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
				<span className="px-2 py-0.5 bg-zinc-800 rounded text-xs uppercase tracking-wide">{batch.status}</span>
				<span>Created {new Date(batch.createdAt).toLocaleDateString()}</span>
			</div>

			{/* Candidate list */}
			<div className="mt-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
				{batch.candidates.map((cand, index) => {
					const rowState = rowStates[cand.id];
					if (!rowState) return null;

					const { draft, isSaving, error: rowError, showSuccess } = rowState;

					// Suggestion status badges
					const isSuggestionPending =
						cand.suggestedBucket === null && cand.suggestionStatus !== 'in_progress' && cand.suggestionStatus !== 'error';
					const isSuggestionInProgress = cand.suggestionStatus === 'in_progress';
					const isSuggestionError = cand.suggestionStatus === 'error';

					// Disable save if suggestion is in progress (no valid suggestion yet)
					const isSaveDisabled = isSaving || isSuggestionInProgress;

					return (
						<div key={cand.id} className="p-4">
							{/* Row header: position, term, badges */}
							<div className="flex items-start gap-4 mb-3">
								<span className="text-zinc-600 text-sm font-mono w-6 text-right flex-shrink-0">{index + 1}</span>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<p className="text-white font-medium">{cand.term}</p>
										{/* Suggestion status badges */}
										{isSuggestionPending && <span className="px-1.5 py-0.5 bg-zinc-700 text-zinc-300 text-xs rounded">Pending</span>}
										{isSuggestionInProgress && <span className="px-1.5 py-0.5 bg-blue-900 text-blue-300 text-xs rounded">Generating...</span>}
										{isSuggestionError && (
											<span
												className="px-1.5 py-0.5 bg-red-900 text-red-300 text-xs rounded cursor-help"
												title={cand.suggestionError ?? 'Unknown error'}
											>
												Suggestion failed
											</span>
										)}
										{showSuccess && <span className="text-green-400 text-xs">✓ Saved</span>}
									</div>
									{cand.term !== cand.normalizedTerm && <p className="text-zinc-500 text-sm mt-0.5">→ {cand.normalizedTerm}</p>}
								</div>
							</div>

							{/* Suggested values (read-only) */}
							{(cand.suggestedBucket || cand.suggestedText) && (
								<div className="ml-10 mb-3 p-2 bg-zinc-900 rounded text-sm text-zinc-400">
									<span className="text-zinc-500">Suggested: </span>
									{cand.suggestedBucket && <span className="text-zinc-300">{cand.suggestedBucket}</span>}
									{cand.suggestedBucket && cand.suggestedText && <span className="text-zinc-500"> — </span>}
									{cand.suggestedText && <span className="text-zinc-300">{cand.suggestedText}</span>}
								</div>
							)}

							{/* Editable fields */}
							<div className="ml-10 flex flex-col gap-3">
								<div className="flex flex-wrap gap-3">
									{/* Bucket dropdown */}
									<div className="flex flex-col gap-1">
										<label className="text-xs text-zinc-500">Bucket</label>
										<select
											value={draft.bucket ?? ''}
											onChange={(e) =>
												updateRowDraft(cand.id, {
													bucket: e.target.value ? (e.target.value as Bucket) : null,
												})
											}
											disabled={isSaving}
											className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm disabled:opacity-50"
										>
											<option value="">Select bucket...</option>
											{BUCKETS.map((b) => (
												<option key={b} value={b}>
													{b}
												</option>
											))}
										</select>
									</div>

									{/* Text input */}
									<div className="flex flex-col gap-1 flex-1 min-w-[200px]">
										<label className="text-xs text-zinc-500">Definition</label>
										<input
											type="text"
											value={draft.text}
											onChange={(e) => updateRowDraft(cand.id, { text: e.target.value })}
											disabled={isSaving}
											maxLength={500}
											placeholder="Enter definition..."
											className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm disabled:opacity-50 w-full"
										/>
									</div>
								</div>

								{/* Action buttons */}
								<div className="flex gap-2">
									<button
										onClick={() => handleSave(cand)}
										disabled={isSaveDisabled}
										className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
									>
										{isSaving && <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />}
										Save
									</button>
									<button
										onClick={() => handleClearOverrides(cand)}
										disabled={isSaving}
										className="px-3 py-1.5 bg-zinc-700 text-zinc-200 text-sm rounded hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									>
										Clear overrides
									</button>
								</div>

								{/* Row error */}
								{rowError && <p className="text-red-400 text-sm">{rowError}</p>}
							</div>
						</div>
					);
				})}
			</div>

			<Link to="/batch/new" className="mt-6 inline-block text-zinc-400 hover:text-white transition-colors">
				← Create another batch
			</Link>
		</div>
	);
}
