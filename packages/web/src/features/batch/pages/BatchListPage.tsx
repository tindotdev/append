import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBatches } from '../api/list-batches';
import type { BatchListItem } from '../types';

/** Format timestamp to relative time (e.g., "2 hours ago") */
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return days === 1 ? '1 day ago' : `${days} days ago`;
	}
	if (hours > 0) {
		return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
	}
	if (minutes > 0) {
		return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
	}
	return 'just now';
}

/** Get status badge variant */
function getStatusBadgeVariant(status: BatchListItem['status']): 'secondary' | 'info' | 'success' {
	switch (status) {
		case 'captured':
			return 'secondary';
		case 'suggested':
			return 'info';
		case 'accepted':
			return 'success';
	}
}

/** Get status label */
function getStatusLabel(status: BatchListItem['status']): string {
	switch (status) {
		case 'captured':
			return 'Captured';
		case 'suggested':
			return 'Suggested';
		case 'accepted':
			return 'Accepted';
	}
}

export function BatchListPage() {
	const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useBatches();

	// Flatten all pages into a single batches array
	const batches = data?.pages.flatMap((page) => page.batches) ?? [];

	// Loading state
	if (isLoading) {
		return (
			<div className="w-full">
				<Skeleton className="h-7 w-32 mb-6" />
				<div className="border border-border rounded-lg divide-y divide-border">
					{[1, 2, 3].map((i) => (
						<div key={i} className="p-4 flex justify-between">
							<div className="flex items-center gap-3">
								<Skeleton className="h-5 w-20" />
								<Skeleton className="h-5 w-16" />
							</div>
							<Skeleton className="h-5 w-24" />
						</div>
					))}
				</div>
			</div>
		);
	}

	// Error state
	if (isError) {
		return (
			<div className="w-full">
				<h2 className="text-xl font-semibold">My Batches</h2>
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-muted-foreground">Something went wrong. Please try again.</p>
					<Button variant="secondary" onClick={() => refetch()} className="mt-4">
						Retry
					</Button>
				</div>
			</div>
		);
	}

	// Empty state
	if (batches.length === 0) {
		return (
			<div className="w-full">
				<h2 className="text-xl font-semibold">My Batches</h2>
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-muted-foreground">No batches yet.</p>
					<Button asChild variant="secondary" className="mt-4">
						<Link to="/batch">Create your first batch</Link>
					</Button>
				</div>
			</div>
		);
	}

	// Batches list
	return (
		<div className="w-full">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">My Batches</h2>
					<p className="text-sm text-muted-foreground mt-1">
						{batches.length} batch{batches.length !== 1 ? 'es' : ''}
						{hasNextPage ? ' (more available)' : ''}
					</p>
				</div>
				<Button asChild variant="secondary">
					<Link to="/batch">New batch</Link>
				</Button>
			</div>

			{/* Batches list */}
			<div className="mt-6 border border-border rounded-lg divide-y divide-border">
				{batches.map((batch) => (
					<Link key={batch.id} to="/batch/$batchId" params={{ batchId: batch.id }} className="block p-4 hover:bg-card/50 transition-colors">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<Badge variant={getStatusBadgeVariant(batch.status)}>{getStatusLabel(batch.status)}</Badge>
								<span className="text-foreground">
									{batch.candidateCount} term{batch.candidateCount !== 1 ? 's' : ''}
								</span>
							</div>
							<span className="text-muted-foreground text-sm">{formatRelativeTime(batch.createdAt)}</span>
						</div>
					</Link>
				))}
			</div>

			{/* Load more button */}
			{hasNextPage && (
				<div className="mt-6 flex justify-center">
					<Button variant="secondary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
						{isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
						Load more
					</Button>
				</div>
			)}
		</div>
	);
}
