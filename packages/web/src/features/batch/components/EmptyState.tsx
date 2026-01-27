import { Link } from '@tanstack/react-router';

export function EmptyState() {
	return (
		<div className="max-w-4xl">
			<h2 className="text-xl font-semibold">Review Batch</h2>
			<div className="mt-6 flex flex-col items-center justify-center py-12 text-center">
				<p className="text-muted-foreground">No candidates in this batch.</p>
			</div>
			<Link to="/batch" className="mt-6 inline-block text-muted-foreground hover:text-foreground transition-colors">
				&larr; Create another batch
			</Link>
		</div>
	);
}
