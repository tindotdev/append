import type { Candidate } from '../types';

export function SuggestedValues({ candidate }: { candidate: Candidate }) {
	if (!candidate.suggestedBucket && !candidate.suggestedText) return null;
	return (
		<div className="ml-10 mb-3 p-2 bg-zinc-900 rounded text-sm text-zinc-400">
			<span className="text-zinc-500">Suggested: </span>
			{candidate.suggestedBucket && <span className="text-zinc-300">{candidate.suggestedBucket}</span>}
			{candidate.suggestedBucket && candidate.suggestedText && <span className="text-zinc-500"> &mdash; </span>}
			{candidate.suggestedText && <span className="text-zinc-300">{candidate.suggestedText}</span>}
		</div>
	);
}
