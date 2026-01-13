/**
 * Loading skeleton for the batch table.
 */

import { Skeleton } from '@/components/ui/skeleton';

interface BatchTableSkeletonProps {
	rows?: number;
}

export function BatchTableSkeleton({ rows = 5 }: BatchTableSkeletonProps) {
	return (
		<div className="space-y-3">
			{Array.from({ length: rows }, (_, i) => i).map((index) => (
				<div
					key={`skeleton-${index}`}
					className="flex items-center gap-3 sm:gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4 overflow-x-auto"
				>
					{/* Checkbox */}
					<Skeleton className="h-4 w-4 rounded shrink-0" />

					{/* Batch info */}
					<div className="flex-1 space-y-2 min-w-0">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-3 w-1/4" />
					</div>

					{/* Status badge */}
					<Skeleton className="h-6 w-20 rounded-full shrink-0 hidden sm:block" />

					{/* Progress */}
					<div className="w-32 space-y-1.5 shrink-0 hidden md:block">
						<Skeleton className="h-1.5 w-full rounded-full" />
						<Skeleton className="h-3 w-full" />
					</div>

					{/* Created time */}
					<Skeleton className="h-4 w-16 shrink-0 hidden lg:block" />

					{/* Actions button */}
					<Skeleton className="h-8 w-8 rounded shrink-0" />
				</div>
			))}
		</div>
	);
}
