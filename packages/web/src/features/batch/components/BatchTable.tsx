import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BatchListItem } from '../types';

interface BatchTableProps {
	columns: ColumnDef<BatchListItem>[];
	data: BatchListItem[];
	onRowClick?: (row: BatchListItem) => void;
	rowSelection?: RowSelectionState;
	onRowSelectionChange?: (selection: RowSelectionState) => void;
}

export function BatchTable({ columns, data, onRowClick, rowSelection = {}, onRowSelectionChange }: BatchTableProps) {
	const [sorting, setSorting] = useState<SortingState>([{ id: 'created', desc: true }]);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		onRowSelectionChange: (updater) => {
			const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater;
			onRowSelectionChange?.(newSelection);
		},
		getRowId: (row) => row.id,
		enableRowSelection: true,
		state: {
			sorting,
			rowSelection,
		},
	});

	return (
		<div className="border border-zinc-800 rounded-lg">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="border-zinc-800 hover:bg-transparent">
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id} className="text-zinc-400">
									{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows?.length ? (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={row.getIsSelected() && 'selected'}
								className="border-zinc-800 cursor-pointer hover:bg-zinc-800/50"
								onClick={() => onRowClick?.(row.original)}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
								No batches found.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
