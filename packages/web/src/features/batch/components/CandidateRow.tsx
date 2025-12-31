import type { Candidate, CandidateDraft, CandidateRowState } from '../types';
import { CandidateActions } from './CandidateActions';
import { CandidateHeader } from './CandidateHeader';
import { type BucketOption, CandidateInputs } from './CandidateInputs';
import { SuggestedValues } from './SuggestedValues';
import { getSuggestionFlags } from './suggestions';

export function CandidateRow({
	candidate,
	index,
	rowState,
	buckets,
	onDraftChange,
	onSave,
	onClear,
}: {
	candidate: Candidate;
	index: number;
	rowState: CandidateRowState;
	buckets: readonly BucketOption[];
	onDraftChange: (id: string, updates: Partial<CandidateDraft>) => void;
	onSave: (candidate: Candidate) => void;
	onClear: (candidate: Candidate) => void;
}) {
	const { draft, isSaving, error: rowError, showSuccess } = rowState;
	const { isSuggestionInProgress } = getSuggestionFlags(candidate);
	const isSaveDisabled = isSaving || isSuggestionInProgress;

	return (
		<div className="p-4">
			<CandidateHeader candidate={candidate} index={index} showSuccess={showSuccess} />
			<SuggestedValues candidate={candidate} />
			<div className="ml-10 flex flex-col gap-3">
				<CandidateInputs
					draft={draft}
					isSaving={isSaving}
					buckets={buckets}
					onDraftChange={(updates) => onDraftChange(candidate.id, updates)}
				/>
				<CandidateActions
					isSaving={isSaving}
					isSaveDisabled={isSaveDisabled}
					onSave={() => onSave(candidate)}
					onClear={() => onClear(candidate)}
				/>
				{rowError && <p className="text-red-400 text-sm">{rowError}</p>}
			</div>
		</div>
	);
}
