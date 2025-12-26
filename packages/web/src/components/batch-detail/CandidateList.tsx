import type { Bucket, Candidate } from '../../lib/api';
import { CandidateRow } from './CandidateRow';
import type { CandidateDraft, RowStateMap } from './types';

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
