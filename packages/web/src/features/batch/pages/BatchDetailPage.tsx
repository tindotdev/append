import { Link, useParams } from '@tanstack/react-router';
import type { RowSelectionState } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api-rpc';
import { useUserBuckets } from '@/lib/user-buckets';
import { acceptBatch } from '../api/accept-batch';
import { acceptCandidate } from '../api/accept-candidate';
import { getBatch } from '../api/get-batch';
import { generateSuggestions } from '../api/retry-suggestions';
import { updateCandidate } from '../api/update-candidate';
import {
	BatchHeader,
	CandidateBulkActionBar,
	CandidateDetailSheet,
	CandidateTable,
	EmptyState,
	ErrorState,
	getCandidateColumns,
	getCandidateStatus,
	LoadingState,
} from '../components';
import type { BatchError, BatchResponse, Candidate, SuggestCandidateEvent } from '../types';

interface GenerationProgress {
	completed: number;
	total: number;
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
	const { batchId } = useParams({ from: '/_protected/batch/$batchId' });
	const [batch, setBatch] = useState<BatchResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<BatchError | null>(null);
	const [isRetrying, setIsRetrying] = useState(false);
	const [isAccepting, setIsAccepting] = useState(false);
	const [isBulkAccepting, setIsBulkAccepting] = useState(false);
	const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
	const generationInFlightRef = useRef(false);

	// Table state
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [searchQuery, setSearchQuery] = useState('');
	const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());

	// Sheet state
	const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
	const [isSavingSheet, setIsSavingSheet] = useState(false);
	const [isAcceptingSheet, setIsAcceptingSheet] = useState(false);

	// Fetch user buckets for the dropdown
	const { data: bucketsData, isLoading: bucketsLoading } = useUserBuckets();
	const buckets = bucketsData?.buckets ?? [];

	const fetchBatch = useCallback(async () => {
		try {
			const data = await getBatch(batchId);
			setBatch(data);
			setError(null);
		} catch (err) {
			setError(getBatchError(err));
		} finally {
			setIsLoading(false);
		}
	}, [batchId]);

	useEffect(() => {
		fetchBatch();
	}, [fetchBatch]);

	// Filter candidates by search query
	const filteredCandidates = useMemo(() => {
		if (!batch) return [];
		if (!searchQuery.trim()) return batch.candidates;

		const query = searchQuery.toLowerCase();
		return batch.candidates.filter((c) => c.term.toLowerCase().includes(query));
	}, [batch, searchQuery]);

	// Count selected candidates
	const selectedCount = Object.keys(rowSelection).length;

	// Handle individual accept from row dropdown
	const handleAcceptCandidate = useCallback(
		async (candidate: Candidate) => {
			setAcceptingIds((prev) => new Set(prev).add(candidate.id));

			try {
				const result = await acceptCandidate(candidate.id, candidate.version);

				// Update the candidate in batch state
				setBatch((prev) => {
					if (!prev) return prev;
					return {
						...prev,
						candidates: prev.candidates.map((c) =>
							c.id === candidate.id
								? {
										...c,
										status: 'accepted',
										materializedTermId: result.termId,
										materializedTermSenseId: result.termSenseId,
										version: result.candidate.version,
									}
								: c
						),
					};
				});

				// Clear from selection if selected
				setRowSelection((prev) => {
					const next = { ...prev };
					delete next[candidate.id];
					return next;
				});

				toast.success(`Accepted "${candidate.term}"`);
			} catch (err) {
				if (err instanceof ApiRequestError) {
					if (err.status === 409) {
						const code = err.code;
						if (code === 'ALREADY_ACCEPTED') {
							toast.info('Already accepted');
							await fetchBatch();
						} else if (code === 'VERSION_CONFLICT') {
							toast.warning('Modified elsewhere. Please refresh.');
							await fetchBatch();
						} else {
							toast.error('Cannot accept. Please try again.');
						}
					} else {
						toast.error('Accept failed. Please try again.');
					}
				} else {
					toast.error('Accept failed. Please try again.');
				}
			} finally {
				setAcceptingIds((prev) => {
					const next = new Set(prev);
					next.delete(candidate.id);
					return next;
				});
			}
		},
		[fetchBatch]
	);

	// Handle bulk accept
	const handleBulkAccept = useCallback(async () => {
		if (!batch) return;

		const selectedCandidates = batch.candidates.filter((c) => rowSelection[c.id] && getCandidateStatus(c) === 'ready');

		if (selectedCandidates.length === 0) return;

		setIsBulkAccepting(true);
		let successCount = 0;
		let failedCount = 0;

		for (const candidate of selectedCandidates) {
			try {
				const result = await acceptCandidate(candidate.id, candidate.version);

				setBatch((prev) => {
					if (!prev) return prev;
					return {
						...prev,
						candidates: prev.candidates.map((c) =>
							c.id === candidate.id
								? {
										...c,
										status: 'accepted',
										materializedTermId: result.termId,
										materializedTermSenseId: result.termSenseId,
										version: result.candidate.version,
									}
								: c
						),
					};
				});

				successCount++;
			} catch {
				failedCount++;
			}
		}

		setRowSelection({});
		setIsBulkAccepting(false);

		if (failedCount === selectedCandidates.length) {
			toast.error('All accepts failed. Please try again.');
		} else if (failedCount > 0) {
			toast.warning(`Accepted ${successCount}, ${failedCount} failed`);
		} else {
			toast.success(`Accepted ${successCount} terms`);
		}
	}, [batch, rowSelection]);

	// Handle edit from row dropdown
	const handleEditCandidate = useCallback((candidate: Candidate) => {
		setSelectedCandidate(candidate);
	}, []);

	// Handle clear overrides from row dropdown
	const handleClearCandidate = useCallback(
		async (candidate: Candidate) => {
			try {
				const response = await updateCandidate(candidate.id, {
					expectedVersion: candidate.version,
					chosenBucket: null,
					chosenText: null,
				});
				setBatch((prev) => updateBatchCandidate(prev, response.candidate));
				toast.success('Overrides cleared');
			} catch (err) {
				if (err instanceof ApiRequestError && err.status === 409) {
					toast.warning('Modified elsewhere. Please refresh.');
					await fetchBatch();
				} else {
					toast.error('Clear failed. Please try again.');
				}
			}
		},
		[fetchBatch]
	);

	// Handle save from sheet
	const handleSheetSave = useCallback(
		async (candidateId: string, bucket: string | null, text: string | null) => {
			const candidate = batch?.candidates.find((c) => c.id === candidateId);
			if (!candidate) return;

			setIsSavingSheet(true);

			try {
				const response = await updateCandidate(candidateId, {
					expectedVersion: candidate.version,
					chosenBucket: bucket,
					chosenText: text,
				});
				setBatch((prev) => updateBatchCandidate(prev, response.candidate));
				setSelectedCandidate(response.candidate);
				toast.success('Saved');
			} catch (err) {
				if (err instanceof ApiRequestError && err.status === 409) {
					toast.warning('Modified elsewhere. Please refresh.');
					await fetchBatch();
					setSelectedCandidate(null);
				} else {
					toast.error('Save failed. Please try again.');
				}
			} finally {
				setIsSavingSheet(false);
			}
		},
		[batch, fetchBatch]
	);

	// Handle clear from sheet
	const handleSheetClear = useCallback(
		async (candidateId: string) => {
			const candidate = batch?.candidates.find((c) => c.id === candidateId);
			if (!candidate) return;

			setIsSavingSheet(true);

			try {
				const response = await updateCandidate(candidateId, {
					expectedVersion: candidate.version,
					chosenBucket: null,
					chosenText: null,
				});
				setBatch((prev) => updateBatchCandidate(prev, response.candidate));
				setSelectedCandidate(response.candidate);
				toast.success('Overrides cleared');
			} catch (err) {
				if (err instanceof ApiRequestError && err.status === 409) {
					toast.warning('Modified elsewhere. Please refresh.');
					await fetchBatch();
					setSelectedCandidate(null);
				} else {
					toast.error('Clear failed. Please try again.');
				}
			} finally {
				setIsSavingSheet(false);
			}
		},
		[batch, fetchBatch]
	);

	// Handle accept from sheet
	const handleSheetAccept = useCallback(
		async (candidate: Candidate) => {
			setIsAcceptingSheet(true);

			try {
				const result = await acceptCandidate(candidate.id, candidate.version);

				const updatedCandidate: Candidate = {
					...candidate,
					status: 'accepted',
					materializedTermId: result.termId,
					materializedTermSenseId: result.termSenseId,
					version: result.candidate.version,
				};

				setBatch((prev) => updateBatchCandidate(prev, updatedCandidate));
				setSelectedCandidate(updatedCandidate);
				toast.success(`Accepted "${candidate.term}"`);
			} catch (err) {
				if (err instanceof ApiRequestError) {
					if (err.status === 409) {
						toast.warning('Modified elsewhere. Please refresh.');
						await fetchBatch();
						setSelectedCandidate(null);
					} else {
						toast.error('Accept failed. Please try again.');
					}
				} else {
					toast.error('Accept failed. Please try again.');
				}
			} finally {
				setIsAcceptingSheet(false);
			}
		},
		[fetchBatch]
	);

	// Handle row click to open sheet
	const handleRowClick = useCallback((candidate: Candidate) => {
		setSelectedCandidate(candidate);
	}, []);

	// Generate suggestions
	const handleGenerateSuggestions = useCallback(async () => {
		if (generationInFlightRef.current) return;
		generationInFlightRef.current = true;

		setIsRetrying(true);
		let successCount = 0;
		let errorCount = 0;
		let completedCount = 0;

		try {
			await generateSuggestions(batchId, {
				onStart: (event) => {
					setGenerationProgress({ completed: 0, total: event.eligibleCount });
				},
				onCandidate: (event) => {
					setBatch((prev) => applySseEventToCandidate(prev, event));
					if (event.status === 'ok' || event.status === 'cached') successCount++;
					if (event.status === 'error') errorCount++;
					completedCount++;
					setGenerationProgress((prev) => (prev ? { ...prev, completed: completedCount } : null));
				},
				onDone: () => {
					setGenerationProgress(null);
					if (errorCount > 0) {
						toast.warning(`Generated ${successCount} suggestions, ${errorCount} failed`);
					} else if (successCount > 0) {
						toast.success(`Generated ${successCount} suggestions`);
					}
				},
				onError: (err) => {
					setGenerationProgress(null);
					toast.error(`Generation failed: ${err}`);
				},
			});
		} catch {
			setGenerationProgress(null);
			toast.error('Failed to generate suggestions. Please try again.');
		} finally {
			generationInFlightRef.current = false;
			setIsRetrying(false);
		}
	}, [batchId]);

	const handleRetryFailed = handleGenerateSuggestions;

	// Accept all (batch-level)
	const handleAcceptAll = useCallback(async () => {
		setIsAccepting(true);
		try {
			const summary = await acceptBatch(batchId);
			toast.success(`Accepted ${summary.acceptedCount} terms (${summary.termCreatedCount} new terms created)`);
			await fetchBatch();
		} catch (err) {
			if (err instanceof ApiRequestError) {
				if (err.status === 409) {
					const reason = err.details?.reason as string | undefined;
					if (reason === 'SUGGESTIONS_IN_PROGRESS') {
						toast.error('Cannot accept: some suggestions are still being generated.');
					} else if (reason === 'MISSING_EFFECTIVE_FIELDS') {
						toast.error('Cannot accept: some candidates are missing bucket or text.');
					} else {
						toast.error('Cannot accept: please refresh and try again.');
					}
				} else {
					toast.error('Accept failed. Please try again.');
				}
			} else {
				toast.error('Accept failed. Please try again.');
			}
		} finally {
			setIsAccepting(false);
		}
	}, [batchId, fetchBatch]);

	// Build column definitions
	const columns = useMemo(
		() =>
			getCandidateColumns({
				onAccept: handleAcceptCandidate,
				onEdit: handleEditCandidate,
				onClear: handleClearCandidate,
				acceptingIds,
			}),
		[handleAcceptCandidate, handleEditCandidate, handleClearCandidate, acceptingIds]
	);

	if (isLoading || bucketsLoading) {
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
		<>
			<div className="max-w-5xl">
				<BatchHeader
					batch={batch}
					isRetrying={isRetrying}
					isAccepting={isAccepting}
					generationProgress={generationProgress}
					onRetryFailed={handleRetryFailed}
					onGenerateSuggestions={handleGenerateSuggestions}
					onAcceptAll={handleAcceptAll}
				/>

				{/* Search filter */}
				<div className="mt-4 mb-4">
					<Input
						type="search"
						placeholder="Filter candidates..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="max-w-sm"
					/>
					{searchQuery && (
						<p className="text-sm text-zinc-500 mt-2">
							{filteredCandidates.length} of {batch.candidates.length} candidates
						</p>
					)}
				</div>

				{/* Candidate table */}
				<CandidateTable
					columns={columns}
					data={filteredCandidates}
					rowSelection={rowSelection}
					onRowSelectionChange={setRowSelection}
					onRowClick={handleRowClick}
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

			{/* Bulk action bar */}
			<CandidateBulkActionBar
				selectedCount={selectedCount}
				isAccepting={isBulkAccepting}
				onClear={() => setRowSelection({})}
				onAcceptSelected={handleBulkAccept}
			/>

			{/* Detail sheet */}
			<CandidateDetailSheet
				candidate={selectedCandidate}
				buckets={buckets}
				isSaving={isSavingSheet}
				isAccepting={isAcceptingSheet}
				onClose={() => setSelectedCandidate(null)}
				onSave={handleSheetSave}
				onClear={handleSheetClear}
				onAccept={handleSheetAccept}
			/>
		</>
	);
}
