import type { Candidate } from '../../lib/api';
import { getSuggestionFlags } from './suggestions';

export function CandidateHeader({ candidate, index, showSuccess }: { candidate: Candidate; index: number; showSuccess: boolean }) {
	const { isSuggestionPending, isSuggestionInProgress, isSuggestionError } = getSuggestionFlags(candidate);
	return (
		<div className="flex items-start gap-4 mb-3">
			<span className="text-zinc-600 text-sm font-mono w-6 text-right flex-shrink-0">{index + 1}</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="text-white font-medium">{candidate.term}</p>
					{isSuggestionPending && <span className="px-1.5 py-0.5 bg-zinc-700 text-zinc-300 text-xs rounded">Pending</span>}
					{isSuggestionInProgress && <span className="px-1.5 py-0.5 bg-blue-900 text-blue-300 text-xs rounded">Generating...</span>}
					{isSuggestionError && (
						<span
							className="px-1.5 py-0.5 bg-red-900 text-red-300 text-xs rounded cursor-help"
							title={candidate.suggestionError ?? 'Unknown error'}
						>
							Suggestion failed
						</span>
					)}
					{showSuccess && <span className="text-green-400 text-xs">&check; Saved</span>}
				</div>
				{candidate.term !== candidate.normalizedTerm && <p className="text-zinc-500 text-sm mt-0.5">&rarr; {candidate.normalizedTerm}</p>}
			</div>
		</div>
	);
}
