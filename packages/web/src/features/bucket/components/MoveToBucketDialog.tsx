import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserBuckets } from '@/lib/user-buckets';

interface MoveToBucketDialogProps {
	open: boolean;
	onClose: () => void;
	onConfirm: (targetBucket: string) => void;
	currentBucket: string;
	itemCount: number;
	isPending?: boolean;
}

export function MoveToBucketDialog({ open, onClose, onConfirm, currentBucket, itemCount, isPending }: MoveToBucketDialogProps) {
	const { data: bucketsData } = useUserBuckets();
	const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

	const userBuckets = bucketsData?.buckets ?? [];
	const availableBuckets = userBuckets.filter((b) => b.slug !== currentBucket);

	const handleConfirm = () => {
		if (selectedBucket) {
			onConfirm(selectedBucket);
		}
	};

	const handleOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			setSelectedBucket(null);
			onClose();
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Move to bucket</DialogTitle>
					<DialogDescription>
						Select a destination bucket for {itemCount} {itemCount === 1 ? 'item' : 'items'}.
					</DialogDescription>
				</DialogHeader>

				<div className="py-4">
					{availableBuckets.length === 0 ? (
						<p className="text-sm text-muted-foreground">No other buckets available.</p>
					) : (
						<div className="space-y-2">
							{availableBuckets.map((bucket) => (
								<button
									key={bucket.slug}
									type="button"
									onClick={() => setSelectedBucket(bucket.slug)}
									className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
										selectedBucket === bucket.slug
											? 'border-primary bg-primary/10 text-primary'
											: 'border-border bg-card/50 text-card-foreground hover:bg-card'
									}`}
								>
									{bucket.name}
								</button>
							))}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button onClick={handleConfirm} disabled={!selectedBucket || isPending}>
						{isPending ? 'Moving...' : 'Move'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
