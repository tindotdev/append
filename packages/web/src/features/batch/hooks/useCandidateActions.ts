import type { RowSelectionState } from '@tanstack/react-table';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/handle-api-error';
import { acceptCandidate } from '../api/accept-candidate';
import { updateCandidate } from '../api/update-candidate';
import { getCandidateStatus } from '../components';
import type { BatchResponse, Candidate } from '../types';
import { updateBatchCandidate } from './batch-utils';

type BulkAcceptCounts = {
	successCount: number;
	failedCount: number;
	alreadyAcceptedCount: number;
	versionConflictCount: number;
};

async function acceptCandidateAndUpdateBatch(
	candidate: Candidate,
	setBatch: React.Dispatch<React.SetStateAction<BatchResponse | null>>
): Promise<{ ok: true } | { ok: false; error: unknown }> {
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
		return { ok: true };
	} catch (error) {
		return { ok: false, error };
	}
}

function trackBulkAcceptError(error: unknown, counts: BulkAcceptCounts): void {
	handleApiError(error, {
		onConflict: (code) => {
			if (code === 'ALREADY_ACCEPTED') {
				counts.alreadyAcceptedCount += 1;
			} else if (code === 'VERSION_CONFLICT') {
				counts.versionConflictCount += 1;
			}
		},
		onDefault: () => {
			// Other errors - no specific tracking
		},
	});
}

async function showBulkAcceptToast(counts: BulkAcceptCounts, totalSelected: number, fetchBatch: () => Promise<void>): Promise<void> {
	if (counts.failedCount === totalSelected) {
		if (counts.alreadyAcceptedCount === counts.failedCount) {
			toast.info('All selected candidates were already accepted.');
		} else if (counts.versionConflictCount > 0) {
			toast.error(`All accepts failed (${counts.versionConflictCount} version conflicts). Please refresh.`);
		} else {
			toast.error('All accepts failed. Please try again.');
		}
		return;
	}

	if (counts.failedCount > 0) {
		const errorDetails: string[] = [];
		if (counts.alreadyAcceptedCount > 0) {
			errorDetails.push(`${counts.alreadyAcceptedCount} already accepted`);
		}
		if (counts.versionConflictCount > 0) {
			errorDetails.push(`${counts.versionConflictCount} version conflicts`);
		}
		const otherErrors = counts.failedCount - counts.alreadyAcceptedCount - counts.versionConflictCount;
		if (otherErrors > 0) {
			errorDetails.push(`${otherErrors} other errors`);
		}

		toast.warning(`Accepted ${counts.successCount}, ${counts.failedCount} failed (${errorDetails.join(', ')})`);
		if (counts.versionConflictCount > 0) {
			await fetchBatch();
		}
		return;
	}

	toast.success(`Accepted ${counts.successCount} terms`);
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
			const counts: BulkAcceptCounts = {
				successCount: 0,
				failedCount: 0,
				alreadyAcceptedCount: 0,
				versionConflictCount: 0,
			};

			for (const candidate of selectedCandidates) {
				const outcome = await acceptCandidateAndUpdateBatch(candidate, setBatch);
				if (outcome.ok) {
					counts.successCount += 1;
					continue;
				}
				counts.failedCount += 1;
				trackBulkAcceptError(outcome.error, counts);
			}

			setRowSelection({});
			setIsBulkAccepting(false);

			await showBulkAcceptToast(counts, selectedCandidates.length, fetchBatch);
		},
		[batch, setBatch, fetchBatch]
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
