import type { RowSelectionState } from '@tanstack/react-table';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/handle-api-error';
import { acceptCandidate } from '../api/accept-candidate';
import { updateCandidate } from '../api/update-candidate';
import { getCandidateStatus } from '../components';
import type { BatchResponse, Candidate } from '../types';

function updateBatchCandidate(batch: BatchResponse | null, candidate: Candidate): BatchResponse | null {
	if (!batch) return batch;
	return {
		...batch,
		candidates: batch.candidates.map((item) => (item.id === candidate.id ? candidate : item)),
	};
}

export function useCandidateActions(
	batch: BatchResponse | null,
	setBatch: React.Dispatch<React.SetStateAction<BatchResponse | null>>,
	fetchBatch: () => Promise<void>
) {
	const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
	const [isBulkAccepting, setIsBulkAccepting] = useState(false);

	const handleAcceptCandidate = useCallback(
		async (candidate: Candidate, setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>) => {
			setAcceptingIds((prev) => new Set(prev).add(candidate.id));

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

				setRowSelection((prev) => {
					const next = { ...prev };
					delete next[candidate.id];
					return next;
				});

				toast.success(`Accepted "${candidate.term}"`);
			} catch (err) {
				handleApiError(err, {
					onConflict: (code) => {
						if (code === 'ALREADY_ACCEPTED') {
							toast.info('Already accepted');
							fetchBatch();
						} else if (code === 'VERSION_CONFLICT') {
							toast.warning('Modified elsewhere. Please refresh.');
							fetchBatch();
						} else {
							toast.error('Cannot accept. Please try again.');
						}
					},
					onDefault: () => toast.error('Accept failed. Please try again.'),
				});
			} finally {
				setAcceptingIds((prev) => {
					const next = new Set(prev);
					next.delete(candidate.id);
					return next;
				});
			}
		},
		[setBatch, fetchBatch]
	);

	const handleBulkAccept = useCallback(
		async (rowSelection: RowSelectionState, setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>) => {
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
		},
		[batch, setBatch]
	);

	const handleEditCandidate = useCallback((candidate: Candidate, setSelectedCandidate: (c: Candidate | null) => void) => {
		setSelectedCandidate(candidate);
	}, []);

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
				handleApiError(err, {
					onConflict: () => {
						toast.warning('Modified elsewhere. Please refresh.');
						fetchBatch();
					},
					onDefault: () => toast.error('Clear failed. Please try again.'),
				});
			}
		},
		[setBatch, fetchBatch]
	);

	return {
		acceptingIds,
		isBulkAccepting,
		handleAcceptCandidate,
		handleBulkAccept,
		handleEditCandidate,
		handleClearCandidate,
	};
}
