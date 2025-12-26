import type { BatchResponse } from '../../lib/api';

export function BatchHeader({ batch }: { batch: BatchResponse }) {
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
		</>
	);
}
