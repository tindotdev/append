import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BucketFeedItem } from '../types';

/**
 * Format a timestamp as a relative date string.
 */
function formatRelativeDate(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minute = 60 * 1000;
	const hour = 60 * minute;
	const day = 24 * hour;
	const week = 7 * day;
	const month = 30 * day;

	if (diff < minute) return 'just now';
	if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
	if (diff < day) return `${Math.floor(diff / hour)}h ago`;
	if (diff < week) return `${Math.floor(diff / day)}d ago`;
	if (diff < month) return `${Math.floor(diff / week)}w ago`;

	return new Date(timestamp).toLocaleDateString();
}

/**
 * Column definitions for the bucket feed table.
 */
export const columns: ColumnDef<BucketFeedItem>[] = [
	{
		accessorKey: 'displayTerm',
		header: ({ column }) => (
			<Button variant="ghost" className="-ml-4 h-8 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
				Term
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ row }) => <span className="font-medium text-zinc-100">{row.original.displayTerm}</span>,
	},
	{
		id: 'definition',
		accessorFn: (row) => row.primarySense.text,
		header: 'Definition',
		cell: ({ row }) => <span className="text-zinc-400 line-clamp-1 max-w-[400px]">{row.original.primarySense.text}</span>,
	},
	{
		id: 'createdAt',
		accessorFn: (row) => row.primarySense.createdAt,
		header: ({ column }) => (
			<Button variant="ghost" className="-ml-4 h-8 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
				Added
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ row }) => <span className="text-zinc-500 text-sm">{formatRelativeDate(row.original.primarySense.createdAt)}</span>,
		sortingFn: 'basic',
	},
];
