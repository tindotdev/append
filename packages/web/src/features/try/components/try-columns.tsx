import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, FolderInput, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TryTerm } from '../types';

export interface TryColumnMeta {
	onDelete: (item: TryTerm) => void;
	onMove: (item: TryTerm) => void;
}

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

export function getTryColumns(meta: TryColumnMeta): ColumnDef<TryTerm>[] {
	return [
		{
			id: 'select',
			header: ({ table }) => (
				<Checkbox
					checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
					onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
					aria-label="Select all"
					className="translate-y-[2px]"
					onClick={(e) => e.stopPropagation()}
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					onCheckedChange={(value) => row.toggleSelected(!!value)}
					aria-label="Select row"
					className="translate-y-[2px]"
					onClick={(e) => e.stopPropagation()}
				/>
			),
			enableSorting: false,
			enableHiding: false,
		},
		{
			accessorKey: 'displayTerm',
			header: ({ column }) => (
				<Button variant="ghost" className="-ml-4 h-8 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
					Term
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			),
			cell: ({ row }) => <span className="font-medium text-card-foreground">{row.original.displayTerm}</span>,
		},
		{
			id: 'definition',
			accessorFn: (row) => row.primarySense.text,
			header: 'Definition',
			cell: ({ row }) => <span className="text-muted-foreground line-clamp-1 max-w-[400px]">{row.original.primarySense.text}</span>,
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
			cell: ({ row }) => <span className="text-muted-foreground text-sm">{formatRelativeDate(row.original.primarySense.createdAt)}</span>,
			sortingFn: 'basic',
		},
		{
			id: 'actions',
			cell: ({ row }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
						<Button variant="ghost" className="h-8 w-8 p-0">
							<span className="sr-only">Open menu</span>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => meta.onMove(row.original)}>
							<FolderInput className="mr-2 h-4 w-4" />
							Move to...
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={() => meta.onDelete(row.original)}>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
			enableSorting: false,
			enableHiding: false,
		},
	];
}
