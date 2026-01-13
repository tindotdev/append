import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ArrowUpDown, ChevronDown, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import type { BatchListItem } from '../types';

export interface BatchColumnMeta {
	onViewDetails: (batch: BatchListItem) => void;
	onAcceptAllReady: (batch: BatchListItem) => void;
	onRetry: (batch: BatchListItem) => void;
	onDelete: (batch: BatchListItem) => void;
	acceptingBatches?: Set<string>;
	retryingBatches?: Set<string>;
	deletingBatches?: Set<string>;
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

/**
 * Column definitions for the batch list table.
 */
export function getBatchColumns(meta: BatchColumnMeta): ColumnDef<BatchListItem>[] {
	return [
		// Checkbox column
		{
			id: 'select',
			header: ({ table }) => {
				const allSelected = table.getIsAllPageRowsSelected();
				const someSelected = table.getIsSomePageRowsSelected();

				return (
					<Checkbox
						checked={allSelected || (someSelected && 'indeterminate')}
						onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
						aria-label="Select all batches"
						className="translate-y-[2px]"
						onClick={(e) => e.stopPropagation()}
					/>
				);
			},
			cell: ({ row }) => {
				return (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
						className="translate-y-[2px]"
						onClick={(e) => e.stopPropagation()}
					/>
				);
			},
			enableSorting: false,
			enableHiding: false,
		},

		// Batch column (primary) - shows sample terms
		{
			id: 'batch',
			accessorFn: (row) => row.sampleTerms.join(', '),
			header: ({ column }) => {
				return (
					<Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
						Batch
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const batch = row.original;
				const displayTerms = batch.sampleTerms.slice(0, 3).join(', ');
				const remainingCount = batch.candidateCount - 3;
				const isExpanded = row.getIsExpanded();

				return (
					<div className="flex items-center gap-2">
						<span className="text-zinc-500">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
						<div className="flex flex-col gap-1">
							<div className="font-medium">
								{displayTerms || 'Empty batch'}
								{remainingCount > 0 && <span className="text-muted-foreground"> +{remainingCount} more</span>}
							</div>
							<div className="text-xs text-muted-foreground">{batch.candidateCount} terms</div>
						</div>
					</div>
				);
			},
		},

		// Status column
		{
			id: 'status',
			accessorKey: 'status',
			header: ({ column }) => {
				return (
					<Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
						Status
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const batch = row.original;
				return (
					<Badge variant={getStatusVariant(batch.status)} className="capitalize">
						{batch.status}
					</Badge>
				);
			},
		},

		// Progress column - shows acceptance rate and breakdown
		{
			id: 'progress',
			accessorKey: 'acceptanceRate',
			header: ({ column }) => {
				return (
					<Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
						Progress
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const batch = row.original;
				const { statusBreakdown } = batch;

				return (
					<div className="flex flex-col gap-2 min-w-[180px]">
						<div className="flex items-center gap-2">
							<Progress value={batch.acceptanceRate} className="h-1.5 flex-1" />
							<span className="text-xs text-muted-foreground min-w-[32px]">{batch.acceptanceRate}%</span>
						</div>
						<div className="text-xs text-muted-foreground">
							{statusBreakdown.accepted > 0 && <span>{statusBreakdown.accepted} accepted</span>}
							{statusBreakdown.ready > 0 && (
								<>
									{statusBreakdown.accepted > 0 && <span> • </span>}
									<span>{statusBreakdown.ready} ready</span>
								</>
							)}
							{statusBreakdown.pending > 0 && (
								<>
									{(statusBreakdown.accepted > 0 || statusBreakdown.ready > 0) && <span> • </span>}
									<span>{statusBreakdown.pending} pending</span>
								</>
							)}
							{statusBreakdown.error > 0 && (
								<>
									{(statusBreakdown.accepted > 0 || statusBreakdown.ready > 0 || statusBreakdown.pending > 0) && <span> • </span>}
									<span className="text-destructive">{statusBreakdown.error} errors</span>
								</>
							)}
						</div>
					</div>
				);
			},
		},

		// Created column
		{
			id: 'created',
			accessorKey: 'createdAt',
			header: ({ column }) => {
				return (
					<Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
						Created
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const batch = row.original;
				return <div className="text-sm text-muted-foreground">{formatDistanceToNow(batch.createdAt, { addSuffix: true })}</div>;
			},
		},

		// Actions column
		{
			id: 'actions',
			cell: ({ row }) => {
				const batch = row.original;
				const hasReadyCandidates = batch.statusBreakdown.ready > 0;
				const hasErrors = batch.hasErrors;
				const isAccepting = meta.acceptingBatches?.has(batch.id) ?? false;
				const isRetrying = meta.retryingBatches?.has(batch.id) ?? false;
				const isDeleting = meta.deletingBatches?.has(batch.id) ?? false;
				const isLoading = isAccepting || isRetrying || isDeleting;

				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
							<Button variant="ghost" className="h-8 w-8 p-0" disabled={isLoading}>
								<span className="sr-only">Open menu</span>
								{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => meta.onViewDetails(batch)}>View Details</DropdownMenuItem>
							{hasReadyCandidates && (
								<DropdownMenuItem onClick={() => meta.onAcceptAllReady(batch)} disabled={isAccepting}>
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
							{hasErrors && (
								<DropdownMenuItem onClick={() => meta.onRetry(batch)} disabled={isRetrying}>
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
							<DropdownMenuSeparator />
							<DropdownMenuItem className="text-destructive" onClick={() => meta.onDelete(batch)} disabled={isDeleting}>
								{isDeleting ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									'Delete Batch'
								)}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
			enableSorting: false,
			enableHiding: false,
		},
	];
}
