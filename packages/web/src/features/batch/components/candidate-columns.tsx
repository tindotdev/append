import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Check, Loader2, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react';
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
import type { Candidate } from '../types';

export type CandidateStatus = 'ready' | 'pending' | 'accepted' | 'error';

/**
 * Determine the display status of a candidate.
 */
export function getCandidateStatus(candidate: Candidate): CandidateStatus {
	// Already accepted
	if (candidate.materializedTermSenseId !== null) {
		return 'accepted';
	}

	// Suggestion in progress
	if (candidate.suggestionStatus === 'in_progress') {
		return 'pending';
	}

	// Suggestion failed
	if (candidate.suggestionStatus === 'error') {
		return 'error';
	}

	// Check if has effective values
	const effectiveBucket = candidate.chosenBucket ?? candidate.suggestedBucket;
	const effectiveText = candidate.chosenText ?? candidate.suggestedText;

	if (effectiveBucket && effectiveText) {
		return 'ready';
	}

	// Missing values
	return 'pending';
}

/**
 * Get effective bucket (chosen or suggested).
 */
export function getEffectiveBucket(candidate: Candidate): string | null {
	return candidate.chosenBucket ?? candidate.suggestedBucket;
}

/**
 * Get effective text (chosen or suggested).
 */
export function getEffectiveText(candidate: Candidate): string | null {
	return candidate.chosenText ?? candidate.suggestedText;
}

export interface CandidateColumnMeta {
	onAccept: (candidate: Candidate) => void;
	onEdit: (candidate: Candidate) => void;
	onClear: (candidate: Candidate) => void;
	acceptingIds: Set<string>;
}

/**
 * Column definitions for the candidate table.
 */
export function getCandidateColumns(meta: CandidateColumnMeta): ColumnDef<Candidate>[] {
	return [
		// Checkbox column
		{
			id: 'select',
			header: ({ table }) => {
				// Only count rows that can be selected (ready status)
				const selectableRows = table.getRowModel().rows.filter((row) => getCandidateStatus(row.original) === 'ready');
				const selectedCount = selectableRows.filter((row) => row.getIsSelected()).length;
				const allSelected = selectableRows.length > 0 && selectedCount === selectableRows.length;
				const someSelected = selectedCount > 0 && selectedCount < selectableRows.length;

				return (
					<Checkbox
						checked={allSelected || (someSelected && 'indeterminate')}
						onCheckedChange={(value) => {
							// Only toggle selectable rows
							for (const row of selectableRows) {
								row.toggleSelected(!!value);
							}
						}}
						aria-label="Select all ready candidates"
						className="translate-y-[2px]"
						onClick={(e) => e.stopPropagation()}
						disabled={selectableRows.length === 0}
					/>
				);
			},
			cell: ({ row }) => {
				const status = getCandidateStatus(row.original);
				const canSelect = status === 'ready';

				return (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
						className="translate-y-[2px]"
						onClick={(e) => e.stopPropagation()}
						disabled={!canSelect}
					/>
				);
			},
			enableSorting: false,
			enableHiding: false,
		},

		// Term column (sortable)
		{
			accessorKey: 'term',
			header: ({ column }) => (
				<Button variant="ghost" className="-ml-4 h-8 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
					Term
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			),
			cell: ({ row }) => <span className="font-medium text-zinc-100">{row.original.term}</span>,
		},

		// Bucket column
		{
			id: 'bucket',
			accessorFn: (row) => getEffectiveBucket(row),
			header: 'Bucket',
			cell: ({ row }) => {
				const status = getCandidateStatus(row.original);
				const bucket = getEffectiveBucket(row.original);

				if (status === 'pending' && row.original.suggestionStatus === 'in_progress') {
					return (
						<span className="text-zinc-500 text-sm flex items-center gap-1">
							<Loader2 className="h-3 w-3 animate-spin" />
							generating...
						</span>
					);
				}

				if (!bucket) {
					return <span className="text-zinc-500 text-sm">—</span>;
				}

				return (
					<Badge variant="outline" className="text-xs">
						{bucket}
					</Badge>
				);
			},
		},

		// Definition column
		{
			id: 'definition',
			accessorFn: (row) => getEffectiveText(row),
			header: 'Definition',
			cell: ({ row }) => {
				const text = getEffectiveText(row.original);

				if (!text) {
					return <span className="text-zinc-500 text-sm">—</span>;
				}

				return <span className="text-zinc-400 line-clamp-1 max-w-[300px]">{text}</span>;
			},
		},

		// Status column
		{
			id: 'status',
			accessorFn: (row) => getCandidateStatus(row),
			header: 'Status',
			cell: ({ row }) => {
				const status = getCandidateStatus(row.original);

				switch (status) {
					case 'ready':
						return (
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-blue-400" />
								<span className="text-sm text-zinc-300">Ready</span>
							</div>
						);
					case 'pending':
						return (
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-yellow-400" />
								<span className="text-sm text-zinc-400">Pending</span>
							</div>
						);
					case 'accepted':
						return (
							<div className="flex items-center gap-2">
								<Check className="h-4 w-4 text-green-400" />
								<span className="text-sm text-green-400">Accepted</span>
							</div>
						);
					case 'error':
						return (
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-red-400" />
								<span className="text-sm text-red-400">Error</span>
							</div>
						);
				}
			},
			enableSorting: false,
		},

		// Actions column
		{
			id: 'actions',
			cell: ({ row }) => {
				const status = getCandidateStatus(row.original);
				const isAccepting = meta.acceptingIds.has(row.original.id);
				const canAccept = status === 'ready' && !isAccepting;

				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
							<Button variant="ghost" className="h-8 w-8 p-0">
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{canAccept && (
								<>
									<DropdownMenuItem onClick={() => meta.onAccept(row.original)}>
										<Check className="mr-2 h-4 w-4" />
										Accept
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							{isAccepting && (
								<DropdownMenuItem disabled>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Accepting...
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={() => meta.onEdit(row.original)}>
								<Pencil className="mr-2 h-4 w-4" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => meta.onClear(row.original)}>
								<RotateCcw className="mr-2 h-4 w-4" />
								Clear overrides
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
