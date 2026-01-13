import {
	type ColumnDef,
	type ExpandedState,
	flexRender,
	getCoreRowModel,
	getExpandedRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { Fragment, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BatchListItem, Candidate } from '../types';
import { ExpandedRowContent } from './ExpandedRowContent';

interface BatchTableProps {
	columns: ColumnDef<BatchListItem>[];
	data: BatchListItem[];
	onRowClick?: (row: BatchListItem) => void;
	rowSelection?: RowSelectionState;
	onRowSelectionChange?: (selection: RowSelectionState) => void;
	onFetchCandidates?: (batchId: string) => Promise<Candidate[]>;
	expanded?: ExpandedState;
	onExpandedChange?: (expanded: ExpandedState) => void;
}

export function BatchTable({
	columns,
	data,
	onRowClick,
	rowSelection = {},
	onRowSelectionChange,
	onFetchCandidates,
	expanded: controlledExpanded,
	onExpandedChange,
}: BatchTableProps) {
	const [sorting, setSorting] = useState<SortingState>([{ id: 'created', desc: true }]);
	const [internalExpanded, setInternalExpanded] = useState<ExpandedState>({});

	// Use controlled state if provided, otherwise use internal state
	const expanded = controlledExpanded ?? internalExpanded;
	const setExpanded = onExpandedChange ?? setInternalExpanded;

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		onSortingChange: setSorting,
		onExpandedChange: (updater) => {
			const newExpanded = typeof updater === 'function' ? updater(expanded) : updater;
			setExpanded(newExpanded);
		},
		onRowSelectionChange: (updater) => {
			const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater;
			onRowSelectionChange?.(newSelection);
		},
		getRowId: (row) => row.id,
		enableRowSelection: true,
		state: {
			sorting,
			rowSelection,
			expanded,
		},
	});

	return (
		<div className="border border-zinc-800 rounded-lg overflow-x-auto">
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
							<Fragment key={row.id}>
								<TableRow
									data-state={row.getIsSelected() && 'selected'}
									data-expanded={row.getIsExpanded()}
									className="border-zinc-800 cursor-pointer hover:bg-zinc-800/50"
									onClick={(e) => {
										// Check if click was on an interactive element
										const target = e.target as HTMLElement;
										const isInteractive = target.closest('button, input, [role="checkbox"], [role="menuitem"]');
										if (!isInteractive) {
											row.toggleExpanded();
										}
									}}
									onDoubleClick={() => onRowClick?.(row.original)}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
									))}
								</TableRow>
								{row.getIsExpanded() && (
									<TableRow className="border-zinc-800 hover:bg-transparent">
										<TableCell colSpan={columns.length} className="p-0">
											<ExpandedRowContent
												batch={row.original}
												onFetchCandidates={onFetchCandidates}
												onViewDetails={() => onRowClick?.(row.original)}
											/>
										</TableCell>
									</TableRow>
								)}
							</Fragment>
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
