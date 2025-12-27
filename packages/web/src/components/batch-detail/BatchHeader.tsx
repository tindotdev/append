import type { BatchResponse } from '../../lib/api';

interface BatchHeaderProps {
	batch: BatchResponse;
	isRetrying?: boolean;
	onRetryFailed?: () => void;
}

export function BatchHeader({ batch, isRetrying, onRetryFailed }: BatchHeaderProps) {
	const failedCount = batch.candidates.filter((c) => c.suggestionStatus === 'error').length;
	const inProgressCount = batch.candidates.filter((c) => c.suggestionStatus === 'in_progress').length;

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
			{(failedCount > 0 || inProgressCount > 0) && (
				<div className="mt-3 flex items-center gap-3">
					{inProgressCount > 0 && (
						<span className="text-sm text-blue-400">
							{inProgressCount} suggestion{inProgressCount !== 1 ? 's' : ''} generating...
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
		</>
	);
}
