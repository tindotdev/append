import { CheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Candidate } from '../types';
import { getSuggestionFlags } from './suggestions';

export function CandidateHeader({ candidate, index, showSuccess }: { candidate: Candidate; index: number; showSuccess: boolean }) {
	const { isSuggestionPending, isSuggestionInProgress, isSuggestionError } = getSuggestionFlags(candidate);
	return (
		<div className="flex items-start gap-4 mb-3">
			<span className="text-muted-foreground text-sm font-mono w-6 text-right flex-shrink-0">{index + 1}</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="text-foreground font-medium">{candidate.term}</p>
					{isSuggestionPending && <Badge variant="secondary">Pending</Badge>}
					{isSuggestionInProgress && <Badge variant="info">Generating...</Badge>}
					{isSuggestionError && (
						<Badge variant="destructive" className="cursor-help" title={candidate.suggestionError ?? 'Unknown error'}>
							Suggestion failed
						</Badge>
					)}
					{showSuccess && (
						<Badge variant="success">
							<CheckIcon className="size-3" />
							Saved
						</Badge>
					)}
				</div>
				{candidate.term !== candidate.normalizedTerm && (
					<p className="text-muted-foreground text-sm mt-0.5">&rarr; {candidate.normalizedTerm}</p>
				)}
			</div>
		</div>
	);
}
