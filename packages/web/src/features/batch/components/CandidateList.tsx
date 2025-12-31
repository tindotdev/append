import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Candidate, CandidateDraft, RowStateMap } from '../types';
import type { BucketOption } from './CandidateInputs';
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
	buckets: readonly BucketOption[];
	onDraftChange: (id: string, updates: Partial<CandidateDraft>) => void;
	onSave: (candidate: Candidate) => void;
	onClear: (candidate: Candidate) => void;
}) {
	const [isAcceptedOpen, setIsAcceptedOpen] = useState(false);

	// Separate pending and accepted candidates
	const pendingCandidates = candidates.filter((c) => c.status !== 'accepted');
	const acceptedCandidates = candidates.filter((c) => c.status === 'accepted');

	return (
		<div className="mt-6">
			{/* Active candidates */}
			{pendingCandidates.length > 0 && (
				<div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
					{pendingCandidates.map((candidate, index) => {
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
			)}

			{/* Accepted candidates - collapsed by default */}
			{acceptedCandidates.length > 0 && (
				<Collapsible open={isAcceptedOpen} onOpenChange={setIsAcceptedOpen} className="mt-4">
					<CollapsibleTrigger className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-400 py-2 cursor-pointer">
						<ChevronRight className={`size-4 transition-transform duration-200 ${isAcceptedOpen ? 'rotate-90' : ''}`} />
						{acceptedCandidates.length} accepted term{acceptedCandidates.length !== 1 ? 's' : ''}
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-2 border border-zinc-800/50 rounded-lg divide-y divide-zinc-800/50 opacity-60">
						{acceptedCandidates.map((candidate) => (
							<div key={candidate.id} className="p-3">
								<div className="flex items-center gap-2">
									<span className="text-green-400 text-xs">✓</span>
									<span className="font-medium">{candidate.term}</span>
									<span className="text-xs text-zinc-500">→ {candidate.chosenBucket ?? candidate.suggestedBucket}</span>
								</div>
								<p className="text-sm text-zinc-500 mt-1 truncate">{candidate.chosenText ?? candidate.suggestedText}</p>
							</div>
						))}
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}
