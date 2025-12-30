import type { BatchResponse } from '../types';
import { getSuggestionFlags } from './suggestions';

interface GenerationProgress {
	completed: number;
	total: number;
}

interface BatchHeaderProps {
	batch: BatchResponse;
	isRetrying?: boolean;
	isAccepting?: boolean;
	generationProgress?: GenerationProgress | null;
	onRetryFailed?: () => void;
	onGenerateSuggestions?: () => void;
	onAcceptAll?: () => void;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: conditional UI based on batch state
export function BatchHeader({
	batch,
	isRetrying,
	isAccepting,
	generationProgress,
	onRetryFailed,
	onGenerateSuggestions,
	onAcceptAll,
}: BatchHeaderProps) {
	const failedCount = batch.candidates.filter((c) => c.suggestionStatus === 'error').length;
	const inProgressCount = batch.candidates.filter((c) => c.suggestionStatus === 'in_progress').length;
	const pendingCount = batch.candidates.filter((c) => getSuggestionFlags(c).isSuggestionPending).length;

	// Check if batch is ready for accept:
	// - No suggestions in progress
	// - All candidates have effective bucket and text (chosen or suggested)
	const isReadyForAccept =
		batch.status !== 'accepted' &&
		inProgressCount === 0 &&
		batch.candidates.every((c) => {
			const effectiveBucket = c.chosenBucket ?? c.suggestedBucket;
			const effectiveText = c.chosenText ?? c.suggestedText;
			return effectiveBucket !== null && effectiveText !== null;
		});

	return (
		<>
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">Review Batch</h2>
				<span className="text-sm text-zinc-500">
					{batch.candidateCount} candidate{batch.candidateCount !== 1 ? 's' : ''}
				</span>
			</div>
			<div className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
				<span className="px-2 py-0.5 bg-zinc-800 rounded text-xs uppercase tracking-wide">{batch.status}</span>
				<span>Created {new Date(batch.createdAt).toLocaleDateString()}</span>
			</div>
			{(pendingCount > 0 || failedCount > 0 || inProgressCount > 0) && (
				<div className="mt-3 flex items-center gap-3">
					{pendingCount > 0 && (
						<>
							<span className="text-sm text-zinc-400">
								{pendingCount} pending suggestion{pendingCount !== 1 ? 's' : ''}
							</span>
							{onGenerateSuggestions && (
								<button
									type="button"
									onClick={onGenerateSuggestions}
									disabled={isRetrying}
									className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{isRetrying ? 'Generating...' : 'Generate suggestions'}
								</button>
							)}
						</>
					)}
					{(inProgressCount > 0 || generationProgress) && (
						<span className="text-sm text-blue-400">
							{generationProgress
								? `Generating ${generationProgress.completed}/${generationProgress.total}...`
								: `${inProgressCount} suggestion${inProgressCount !== 1 ? 's' : ''} generating...`}
						</span>
					)}
					{failedCount > 0 && (
						<>
							<span className="text-sm text-red-400">
								{failedCount} suggestion{failedCount !== 1 ? 's' : ''} failed
							</span>
							{onRetryFailed && (
								<button
									type="button"
									onClick={onRetryFailed}
									disabled={isRetrying}
									className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{isRetrying ? 'Retrying...' : 'Retry failed'}
								</button>
							)}
						</>
					)}
				</div>
			)}
			{/* Accept All button - shown when batch is ready */}
			{isReadyForAccept && onAcceptAll && (
				<div className="mt-4">
					<button
						type="button"
						onClick={onAcceptAll}
						disabled={isAccepting}
						className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isAccepting ? 'Accepting...' : 'Accept All'}
					</button>
					<p className="mt-1 text-xs text-zinc-500">This will save all {batch.candidateCount} terms to your vocabulary.</p>
				</div>
			)}
			{/* Show accepted status */}
			{batch.status === 'accepted' && (
				<div className="mt-4 p-3 bg-green-900/20 border border-green-800 rounded">
					<p className="text-green-400 text-sm font-medium">All terms have been accepted!</p>
					<p className="text-green-500/70 text-xs mt-1">View your terms in the bucket pages.</p>
				</div>
			)}
		</>
	);
}
