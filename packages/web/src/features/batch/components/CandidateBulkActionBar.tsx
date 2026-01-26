import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CandidateBulkActionBarProps {
	selectedCount: number;
	isAccepting: boolean;
	onClear: () => void;
	onAcceptSelected: () => void;
}

export function CandidateBulkActionBar({ selectedCount, isAccepting, onClear, onAcceptSelected }: CandidateBulkActionBarProps) {
	if (selectedCount === 0) return null;

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
			<div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl">
				{/* Selection info */}
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-zinc-100">{selectedCount} selected</span>
					<button
						type="button"
						onClick={onClear}
						className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
						aria-label="Clear selection"
						disabled={isAccepting}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Divider */}
				<div className="h-6 w-px bg-zinc-700" />

				{/* Accept button */}
				<Button
					size="sm"
					variant="outline"
					onClick={onAcceptSelected}
					disabled={isAccepting}
					className="border-zinc-600 text-zinc-100 hover:bg-zinc-800 hover:text-white"
				>
					{isAccepting ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Accepting...
						</>
					) : (
						<>
							<Check className="mr-2 h-4 w-4" />
							Accept {selectedCount} selected
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
