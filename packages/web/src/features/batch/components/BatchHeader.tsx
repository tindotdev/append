import { CheckCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
				<Badge variant="outline" className="uppercase tracking-wide">
					{batch.status}
				</Badge>
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
								<Button size="sm" onClick={onGenerateSuggestions} disabled={isRetrying}>
									{isRetrying ? 'Generating...' : 'Generate suggestions'}
								</Button>
							)}
						</>
					)}
					{(inProgressCount > 0 || generationProgress) && (
						<div className="flex items-center gap-3 flex-1">
							<Progress
								value={generationProgress ? (generationProgress.completed / generationProgress.total) * 100 : 0}
								className="h-2 flex-1 max-w-32"
							/>
							<span className="text-sm text-blue-400">
								{generationProgress ? `${generationProgress.completed}/${generationProgress.total}` : `${inProgressCount} generating...`}
							</span>
						</div>
					)}
					{failedCount > 0 && (
						<>
							<span className="text-sm text-red-400">
								{failedCount} suggestion{failedCount !== 1 ? 's' : ''} failed
							</span>
							{onRetryFailed && (
								<Button size="sm" variant="secondary" onClick={onRetryFailed} disabled={isRetrying}>
									{isRetrying ? 'Retrying...' : 'Retry failed'}
								</Button>
							)}
						</>
					)}
				</div>
			)}
			{/* Accept All button - shown when batch is ready */}
			{isReadyForAccept && onAcceptAll && (
				<div className="mt-4">
					<Button onClick={onAcceptAll} disabled={isAccepting} className="bg-green-600 hover:bg-green-500">
						{isAccepting ? 'Accepting...' : 'Accept All'}
					</Button>
					<p className="mt-1 text-xs text-zinc-500">This will save all {batch.candidateCount} terms to your vocabulary.</p>
				</div>
			)}
			{/* Show accepted status */}
			{batch.status === 'accepted' && (
				<Alert className="mt-4 bg-green-900/20 border-green-800">
					<CheckCircleIcon className="size-4 text-green-400" />
					<AlertTitle className="text-green-400">All terms have been accepted!</AlertTitle>
					<AlertDescription className="text-green-500/70">View your terms in the bucket pages.</AlertDescription>
				</Alert>
			)}
		</>
	);
}
