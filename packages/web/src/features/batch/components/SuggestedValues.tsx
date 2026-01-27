import type { Candidate } from '../types';

export function SuggestedValues({ candidate }: { candidate: Candidate }) {
	if (!candidate.suggestedBucket && !candidate.suggestedText) return null;
	return (
		<div className="ml-10 mb-3 p-2 bg-card rounded text-sm text-muted-foreground">
			<span className="text-muted-foreground">Suggested: </span>
			{candidate.suggestedBucket && <span className="text-foreground">{candidate.suggestedBucket}</span>}
			{candidate.suggestedBucket && candidate.suggestedText && <span className="text-muted-foreground"> &mdash; </span>}
			{candidate.suggestedText && <span className="text-foreground">{candidate.suggestedText}</span>}
		</div>
	);
}
