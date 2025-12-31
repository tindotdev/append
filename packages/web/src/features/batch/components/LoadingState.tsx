import { Skeleton } from '@/components/ui/skeleton';

export function LoadingState() {
	return (
		<div className="max-w-4xl space-y-6">
			{/* Header skeleton */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-40" />
				<Skeleton className="h-5 w-24" />
			</div>
			{/* Status bar skeleton */}
			<div className="flex items-center gap-3">
				<Skeleton className="h-5 w-20" />
				<Skeleton className="h-5 w-32" />
			</div>
			{/* Content skeleton */}
			<div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
				{[1, 2, 3].map((i) => (
					<div key={i} className="p-4 space-y-3">
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				))}
			</div>
		</div>
	);
}
