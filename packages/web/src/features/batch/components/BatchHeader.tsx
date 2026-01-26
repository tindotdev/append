import { CheckCircle, MoreVertical, RefreshCcw, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import type { BatchResponse } from '../types';
import { getCandidateStatus } from './candidate-columns';

interface GenerationProgress {
	completed: number;
	total: number;
}

interface BatchHeaderProps {
	batch: BatchResponse;
	isRetrying?: boolean;
	generationProgress?: GenerationProgress | null;
	onRetryFailed?: () => void;
	onGenerateSuggestions?: () => void;
}

export function BatchHeader({ batch, isRetrying, generationProgress, onRetryFailed, onGenerateSuggestions }: BatchHeaderProps) {
	// Calculate status counts
	const readyCount = batch.candidates.filter((c) => getCandidateStatus(c) === 'ready').length;
	const pendingCount = batch.candidates.filter((c) => getCandidateStatus(c) === 'pending').length;
	const errorCount = batch.candidates.filter((c) => getCandidateStatus(c) === 'error').length;

	const canRetry = errorCount > 0 || pendingCount > 0;
	const hasActions = canRetry || generationProgress;

	return (
		<div className="space-y-4">
			{/* Title row */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">Batch: Review</h2>
					<p className="text-sm text-zinc-400 mt-1">
						{batch.candidateCount} total • {readyCount} ready
					</p>
				</div>
				<Badge variant="outline" className="uppercase tracking-wide">
					{batch.status}
				</Badge>
			</div>

			{/* Action toolbar - only show when there are actions available */}
			{hasActions && (
				<div className="flex items-center gap-3 flex-wrap">
					{/* Primary actions */}
					{canRetry && (
						<Button onClick={errorCount > 0 ? onRetryFailed : onGenerateSuggestions} disabled={isRetrying} variant="secondary" size="sm">
							{isRetrying ? (
								<>
									<RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
									Generating...
								</>
							) : (
								<>
									<RefreshCcw className="mr-2 h-4 w-4" />
									{errorCount > 0 ? `Retry (${errorCount})` : `Generate (${pendingCount})`}
								</>
							)}
						</Button>
					)}

					{/* More menu - only show when there are actions or in progress */}
					{(canRetry || generationProgress) && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="sm">
									<MoreVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{onGenerateSuggestions && (
									<DropdownMenuItem onClick={onGenerateSuggestions} disabled={isRetrying}>
										<Sparkles className="mr-2 h-4 w-4" />
										Generate all suggestions
									</DropdownMenuItem>
								)}
								{onRetryFailed && errorCount > 0 && (
									<DropdownMenuItem onClick={onRetryFailed} disabled={isRetrying}>
										<RefreshCcw className="mr-2 h-4 w-4" />
										Retry failed ({errorCount})
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{/* Progress indicator */}
					{generationProgress && (
						<div className="flex items-center gap-2 ml-auto">
							<Progress value={(generationProgress.completed / generationProgress.total) * 100} className="h-2 w-24" />
							<span className="text-sm text-blue-400">
								{generationProgress.completed}/{generationProgress.total}
							</span>
						</div>
					)}
				</div>
			)}

			{/* Batch accepted alert */}
			{batch.status === 'accepted' && (
				<Alert className="bg-green-900/20 border-green-800">
					<CheckCircle className="h-4 w-4 text-green-400" />
					<AlertTitle className="text-green-400">All terms have been accepted!</AlertTitle>
					<AlertDescription className="text-green-500/70">View your terms in the bucket pages.</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
