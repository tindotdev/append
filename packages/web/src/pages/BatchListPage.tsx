import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, type BatchListItem, listBatches } from '../lib/api';

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

/** Get status badge styling */
function getStatusBadge(status: BatchListItem['status']): { label: string; className: string } {
	switch (status) {
		case 'captured':
			return { label: 'Captured', className: 'bg-zinc-700 text-zinc-300' };
		case 'suggested':
			return { label: 'Suggested', className: 'bg-blue-900/50 text-blue-300' };
		case 'accepted':
			return { label: 'Accepted', className: 'bg-green-900/50 text-green-300' };
	}
}

export function BatchListPage() {
	const [batches, setBatches] = useState<BatchListItem[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchInitialPage = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const response = await listBatches();
			setBatches(response.batches);
			setNextCursor(response.nextCursor);
		} catch (err) {
			if (err instanceof ApiRequestError) {
				if (err.status === 401) {
					setError('Your session has expired. Please sign in again.');
				} else {
					setError('Something went wrong. Please try again.');
				}
			} else {
				setError('Something went wrong. Please try again.');
			}
		} finally {
			setIsLoading(false);
		}
	}, []);

	const loadMore = async () => {
		if (!nextCursor || isLoadingMore) return;

		setIsLoadingMore(true);
		try {
			const response = await listBatches({ cursor: nextCursor });
			setBatches((prev) => [...prev, ...response.batches]);
			setNextCursor(response.nextCursor);
		} catch (err) {
			if (err instanceof ApiRequestError) {
				setError('Failed to load more batches. Please try again.');
			} else {
				setError('Failed to load more batches. Please try again.');
			}
		} finally {
			setIsLoadingMore(false);
		}
	};

	useEffect(() => {
		fetchInitialPage();
	}, [fetchInitialPage]);

	// Loading state
	if (isLoading) {
		return (
			<div className="max-w-4xl">
				<h2 className="text-xl font-semibold">My Batches</h2>
				<div className="flex items-center justify-center py-12">
					<span className="text-zinc-400">Loading...</span>
				</div>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="max-w-4xl">
				<h2 className="text-xl font-semibold">My Batches</h2>
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-zinc-400">{error}</p>
					<button
						onClick={() => {
							setError(null);
							fetchInitialPage();
						}}
						className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors"
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	// Empty state
	if (batches.length === 0) {
		return (
			<div className="max-w-4xl">
				<h2 className="text-xl font-semibold">My Batches</h2>
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-zinc-400">No batches yet.</p>
					<Link to="/batch/new" className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors">
						Create your first batch
					</Link>
				</div>
			</div>
		);
	}

	// Batches list
	return (
		<div className="max-w-4xl">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">My Batches</h2>
					<p className="text-sm text-zinc-500 mt-1">
						{batches.length} batch{batches.length !== 1 ? 'es' : ''}
						{nextCursor ? ' (more available)' : ''}
					</p>
				</div>
				<Link to="/batch/new" className="px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors">
					New batch
				</Link>
			</div>

			{/* Batches list */}
			<div className="mt-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
				{batches.map((batch) => {
					const statusBadge = getStatusBadge(batch.status);
					return (
						<Link key={batch.id} to="/batch/$batchId" params={{ batchId: batch.id }} className="block p-4 hover:bg-zinc-900/50 transition-colors">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<span className={`text-xs px-2 py-0.5 rounded ${statusBadge.className}`}>{statusBadge.label}</span>
									<span className="text-white">
										{batch.candidateCount} term{batch.candidateCount !== 1 ? 's' : ''}
									</span>
								</div>
								<span className="text-zinc-500 text-sm">{formatRelativeTime(batch.createdAt)}</span>
							</div>
						</Link>
					);
				})}
			</div>

			{/* Load more button */}
			{nextCursor && (
				<div className="mt-6 flex justify-center">
					<button
						onClick={loadMore}
						disabled={isLoadingMore}
						className="px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
					>
						{isLoadingMore && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
						Load more
					</button>
				</div>
			)}
		</div>
	);
}
