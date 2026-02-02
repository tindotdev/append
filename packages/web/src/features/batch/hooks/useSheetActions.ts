import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/handle-api-error';
import { acceptCandidate } from '../api/accept-candidate';
import { updateCandidate } from '../api/update-candidate';
import type { BatchResponse, Candidate } from '../types';

function updateBatchCandidate(batch: BatchResponse | null, candidate: Candidate): BatchResponse | null {
	if (!batch) return batch;
	return {
		...batch,
		candidates: batch.candidates.map((item) => (item.id === candidate.id ? candidate : item)),
	};
}

export function useSheetActions(
	batch: BatchResponse | null,
	setBatch: React.Dispatch<React.SetStateAction<BatchResponse | null>>,
	fetchBatch: () => Promise<void>
) {
	const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
	const [isSavingSheet, setIsSavingSheet] = useState(false);
	const [isAcceptingSheet, setIsAcceptingSheet] = useState(false);

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
				handleApiError(err, {
					onConflict: () => {
						toast.warning('Modified elsewhere. Please refresh.');
						fetchBatch();
						setSelectedCandidate(null);
					},
					onDefault: () => toast.error('Save failed. Please try again.'),
				});
			} finally {
				setIsSavingSheet(false);
			}
		},
		[batch, setBatch, fetchBatch]
	);

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
				handleApiError(err, {
					onConflict: () => {
						toast.warning('Modified elsewhere. Please refresh.');
						fetchBatch();
						setSelectedCandidate(null);
					},
					onDefault: () => toast.error('Clear failed. Please try again.'),
				});
			} finally {
				setIsSavingSheet(false);
			}
		},
		[batch, setBatch, fetchBatch]
	);

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
				handleApiError(err, {
					onConflict: () => {
						toast.warning('Modified elsewhere. Please refresh.');
						fetchBatch();
						setSelectedCandidate(null);
					},
					onDefault: () => toast.error('Accept failed. Please try again.'),
				});
			} finally {
				setIsAcceptingSheet(false);
			}
		},
		[setBatch, fetchBatch]
	);

	return {
		selectedCandidate,
		setSelectedCandidate,
		isSavingSheet,
		isAcceptingSheet,
		handleSheetSave,
		handleSheetClear,
		handleSheetAccept,
	};
}
