import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import type { BatchError } from '../types';

export function ErrorState({ error, onRetry }: { error: BatchError; onRetry: () => void }) {
	const is5xx = error.status >= 500;
	const is401 = error.status === 401;
	return (
		<div className="max-w-4xl">
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-muted-foreground">{error.message}</p>
				{is401 && (
					<Button asChild variant="default" className="mt-4">
						<Link to="/sign-in">Sign In</Link>
					</Button>
				)}
				{is5xx && (
					<Button variant="secondary" onClick={onRetry} className="mt-4">
						Retry
					</Button>
				)}
			</div>
			<Link to="/batch" className="mt-4 inline-block text-muted-foreground hover:text-foreground transition-colors">
				&larr; Create new batch
			</Link>
		</div>
	);
}
