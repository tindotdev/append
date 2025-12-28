import type { Bucket } from '@append/contracts/types';
import type { Candidate, CandidateDraft, RowStateMap } from '../types';
import { CandidateRow } from './CandidateRow';

export function CandidateList({
	candidates,
	rowStates,
	buckets,
	onDraftChange,
	onSave,
	onClear,
}: {
	candidates: Candidate[];
	rowStates: RowStateMap;
	buckets: readonly Bucket[];
	onDraftChange: (id: string, updates: Partial<CandidateDraft>) => void;
	onSave: (candidate: Candidate) => void;
	onClear: (candidate: Candidate) => void;
}) {
	return (
		<div className="mt-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
			{candidates.map((candidate, index) => {
				const rowState = rowStates[candidate.id];
				if (!rowState) return null;
				return (
					<CandidateRow
						key={candidate.id}
						candidate={candidate}
						index={index}
						rowState={rowState}
						buckets={buckets}
						onDraftChange={onDraftChange}
						onSave={onSave}
						onClear={onClear}
					/>
				);
			})}
		</div>
	);
}
