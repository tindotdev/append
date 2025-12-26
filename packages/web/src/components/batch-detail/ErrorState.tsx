import { Link } from '@tanstack/react-router';
import type { BatchError } from './types';

export function ErrorState({ error, onRetry }: { error: BatchError; onRetry: () => void }) {
	const is5xx = error.status >= 500;
	return (
		<div className="max-w-4xl">
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-zinc-400">{error.message}</p>
				{is5xx && (
					<button onClick={onRetry} className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors">
						Retry
					</button>
				)}
			</div>
			<Link to="/batch/new" className="mt-4 inline-block text-zinc-400 hover:text-white transition-colors">
				&larr; Create new batch
			</Link>
		</div>
	);
}
