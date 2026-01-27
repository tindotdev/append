import { FolderInput, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BulkActionBarProps {
	selectedCount: number;
	onClear: () => void;
	onBulkDelete: () => void;
	onBulkMove: () => void;
}

export function BulkActionBar({ selectedCount, onClear, onBulkDelete, onBulkMove }: BulkActionBarProps) {
	if (selectedCount === 0) return null;

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
			<div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-xl">
				{/* Selection info */}
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-card-foreground">{selectedCount} selected</span>
					<button
						type="button"
						onClick={onClear}
						className="rounded-full p-1 text-muted-foreground hover:bg-card/50 hover:text-card-foreground transition-colors"
						aria-label="Clear selection"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Divider */}
				<div className="h-6 w-px bg-border" />

				{/* Actions dropdown */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="border-border bg-card hover:bg-card/50">
							Actions
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onBulkMove}>
							<FolderInput className="mr-2 h-4 w-4" />
							Move to...
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={onBulkDelete}>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
