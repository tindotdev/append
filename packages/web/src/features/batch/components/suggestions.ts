import type { Candidate } from '../types';

export function getSuggestionFlags(candidate: Candidate) {
	const isSuggestionPending =
		candidate.suggestedBucket === null && candidate.suggestionStatus !== 'in_progress' && candidate.suggestionStatus !== 'error';
	return {
		isSuggestionPending,
		isSuggestionInProgress: candidate.suggestionStatus === 'in_progress',
		isSuggestionError: candidate.suggestionStatus === 'error',
	};
}
