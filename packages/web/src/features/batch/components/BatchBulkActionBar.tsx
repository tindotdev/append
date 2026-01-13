import { Check, ChevronDown, Loader2, RotateCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BatchBulkActionBarProps {
	selectedCount: number;
	isAccepting: boolean;
	isRetrying: boolean;
	isDeleting: boolean;
	onClear: () => void;
	onAcceptAllReady: () => void;
	onRetry: () => void;
	onDelete: () => void;
}

export function BatchBulkActionBar({
	selectedCount,
	isAccepting,
	isRetrying,
	isDeleting,
	onClear,
	onAcceptAllReady,
	onRetry,
	onDelete,
}: BatchBulkActionBarProps) {
	if (selectedCount === 0) return null;

	const isLoading = isAccepting || isRetrying || isDeleting;

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
			<div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl">
				{/* Selection info */}
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-zinc-100">
						{selectedCount} batch{selectedCount !== 1 ? 'es' : ''} selected
					</span>
					<button
						type="button"
						onClick={onClear}
						className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
						aria-label="Clear selection"
						disabled={isLoading}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Divider */}
				<div className="h-6 w-px bg-zinc-700" />

				{/* Accept All Ready button */}
				<Button size="sm" className="bg-green-600 hover:bg-green-500" onClick={onAcceptAllReady} disabled={isLoading}>
					{isAccepting ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Accepting...
						</>
					) : (
						<>
							<Check className="mr-2 h-4 w-4" />
							Accept All Ready
						</>
					)}
				</Button>

				{/* More Actions dropdown */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" disabled={isLoading}>
							{isRetrying ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Retrying...
								</>
							) : isDeleting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								<>
									More Actions
									<ChevronDown className="ml-1 h-4 w-4" />
								</>
							)}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onRetry} disabled={isLoading}>
							<RotateCw className="mr-2 h-4 w-4" />
							Retry Suggestions
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onDelete} disabled={isLoading} className="text-red-400 focus:text-red-400 focus:bg-red-500/10">
							<Trash2 className="mr-2 h-4 w-4" />
							Delete Batches
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
