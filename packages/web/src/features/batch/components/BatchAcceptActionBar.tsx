import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BatchAcceptActionBarProps {
	readyCount: number;
	isAccepting: boolean;
	onAcceptAll: () => void;
}

export function BatchAcceptActionBar({ readyCount, isAccepting, onAcceptAll }: BatchAcceptActionBarProps) {
	if (readyCount === 0) return null;

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
			<div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl">
				{/* Ready count info */}
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-zinc-100">{readyCount} ready</span>
				</div>

				{/* Divider */}
				<div className="h-6 w-px bg-zinc-700" />

				{/* Accept All button */}
				<Button
					size="sm"
					variant="outline"
					onClick={onAcceptAll}
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
							Accept All
							<ArrowRight className="ml-2 h-4 w-4" />
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
