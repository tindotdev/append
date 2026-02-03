import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp, Loader2, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import type { BatchProgress } from '../hooks/useBatchStatusUpdates';
import type { BatchListItem, Candidate } from '../types';
import { BatchCardContent } from './BatchCardContent';

interface BatchCardProps {
	batch: BatchListItem;
	isSelected: boolean;
	isExpanded: boolean;
	onToggleSelection: (checked: boolean) => void;
	onToggleExpanded: () => void;
	onViewDetails: () => void;
	onAcceptAllReady?: () => void;
	onRetry?: () => void;
	onDelete?: () => void;
	onFetchCandidates?: (batchId: string) => Promise<Candidate[]>;
	isAccepting?: boolean;
	isRetrying?: boolean;
	isDeleting?: boolean;
	batchProgress?: BatchProgress;
}

function getStatusVariant(status: string): 'secondary' | 'default' | 'success' {
	switch (status) {
		case 'captured':
			return 'secondary';
		case 'suggested':
			return 'default';
		case 'accepted':
			return 'success';
		default:
			return 'secondary';
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Card component handles multiple states (selection, expansion, loading, progress) and actions
export function BatchCard({
	batch,
	isSelected,
	isExpanded,
	onToggleSelection,
	onToggleExpanded,
	onViewDetails,
	onAcceptAllReady,
	onRetry,
	onDelete,
	onFetchCandidates,
	isAccepting = false,
	isRetrying = false,
	isDeleting = false,
	batchProgress,
}: BatchCardProps) {
	const hasReadyCandidates = batch.statusBreakdown.ready > 0;
	const hasErrors = batch.hasErrors;
	const isLoading = isAccepting || isRetrying || isDeleting;

	// Check if batch is actively being processed
	const isProcessing = batchProgress?.status === 'active';

	// Display terms
	const displayTerms = batch.sampleTerms.slice(0, 3).join(', ');
	const remainingCount = batch.candidateCount - 3;

	return (
		<Card className={isSelected ? 'ring-2 ring-ring' : ''}>
			<Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
				<CardHeader>
					<div className="flex items-start gap-3">
						{/* Checkbox */}
						<Checkbox
							checked={isSelected}
							onCheckedChange={onToggleSelection}
							aria-label="Select batch"
							className="mt-0.5"
							onClick={(e) => e.stopPropagation()}
						/>

						{/* Batch Info */}
						<div className="flex-1 min-w-0">
							<div className="flex items-start justify-between gap-2 mb-2">
								<CardTitle className="truncate">
									{displayTerms || 'Empty batch'}
									{remainingCount > 0 && <span className="text-muted-foreground font-normal"> +{remainingCount} more</span>}
								</CardTitle>
								<Badge variant={getStatusVariant(batch.status)} className="capitalize shrink-0">
									{batch.status}
								</Badge>
							</div>

							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<span>{batch.candidateCount} terms</span>
								<span>•</span>
								<span>{formatDistanceToNow(batch.createdAt, { addSuffix: true })}</span>
							</div>
						</div>
					</div>
				</CardHeader>

				<CardContent>
					{/* Progress Display */}
					{isProcessing && batchProgress ? (
						// Real-time processing progress
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<Progress
									value={batchProgress.total > 0 ? Math.round((batchProgress.processed / batchProgress.total) * 100) : 0}
									className="h-1.5 flex-1"
								/>
								<span className="text-xs text-muted-foreground min-w-[32px]">
									{batchProgress.total > 0 ? Math.round((batchProgress.processed / batchProgress.total) * 100) : 0}%
								</span>
							</div>
							<div className="text-xs text-muted-foreground flex items-center gap-1">
								<Loader2 className="h-3 w-3 animate-spin" />
								<span>
									{batchProgress.processed} / {batchProgress.total} processed
									{batchProgress.failed > 0 && <span className="text-destructive"> • {batchProgress.failed} failed</span>}
								</span>
							</div>
						</div>
					) : (
						// Static acceptance breakdown
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<Progress value={batch.acceptanceRate} className="h-1.5 flex-1" />
								<span className="text-xs text-muted-foreground min-w-[32px]">{batch.acceptanceRate}%</span>
							</div>
							<div className="text-xs text-muted-foreground">
								{batch.statusBreakdown.accepted > 0 && <span>{batch.statusBreakdown.accepted} accepted</span>}
								{batch.statusBreakdown.ready > 0 && (
									<>
										{batch.statusBreakdown.accepted > 0 && <span> • </span>}
										<span>{batch.statusBreakdown.ready} ready</span>
									</>
								)}
								{batch.statusBreakdown.pending > 0 && (
									<>
										{(batch.statusBreakdown.accepted > 0 || batch.statusBreakdown.ready > 0) && <span> • </span>}
										<span>{batch.statusBreakdown.pending} pending</span>
									</>
								)}
								{batch.statusBreakdown.error > 0 && (
									<>
										{(batch.statusBreakdown.accepted > 0 || batch.statusBreakdown.ready > 0 || batch.statusBreakdown.pending > 0) && <span> • </span>}
										<span className="text-destructive">{batch.statusBreakdown.error} errors</span>
									</>
								)}
							</div>
						</div>
					)}
				</CardContent>

				<CardFooter>
					<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
						{/* Expand button */}
						<Button variant="ghost" size="sm" onClick={onToggleExpanded} className="justify-start">
							{isExpanded ? (
								<>
									<ChevronUp className="h-4 w-4 mr-2" />
									Hide details
								</>
							) : (
								<>
									<ChevronDown className="h-4 w-4 mr-2" />
									Show details
								</>
							)}
						</Button>

						{/* Actions */}
						<div className="flex items-center gap-2">
							<Button variant="secondary" size="sm" onClick={onViewDetails}>
								View
							</Button>
							{hasReadyCandidates && onAcceptAllReady && (
								<Button variant="default" size="sm" onClick={onAcceptAllReady} disabled={isAccepting}>
									{isAccepting ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Accepting...
										</>
									) : (
										`Accept (${batch.statusBreakdown.ready})`
									)}
								</Button>
							)}
							<DropdownMenu>
								<DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
									<Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
										{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={onViewDetails}>View Details</DropdownMenuItem>
									{hasReadyCandidates && onAcceptAllReady && (
										<DropdownMenuItem onClick={onAcceptAllReady} disabled={isAccepting}>
											{isAccepting ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													Accepting...
												</>
											) : (
												`Accept All Ready (${batch.statusBreakdown.ready})`
											)}
										</DropdownMenuItem>
									)}
									{hasErrors && onRetry && (
										<DropdownMenuItem onClick={onRetry} disabled={isRetrying}>
											{isRetrying ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													Retrying...
												</>
											) : (
												`Retry Failed (${batch.errorCount})`
											)}
										</DropdownMenuItem>
									)}
									{onDelete && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem className="text-destructive" onClick={onDelete} disabled={isDeleting}>
												{isDeleting ? (
													<>
														<Loader2 className="mr-2 h-4 w-4 animate-spin" />
														Deleting...
													</>
												) : (
													'Delete Batch'
												)}
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				</CardFooter>

				{/* Expandable Content */}
				<CollapsibleContent>
					<BatchCardContent batch={batch} onFetchCandidates={onFetchCandidates} onViewDetails={onViewDetails} />
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
