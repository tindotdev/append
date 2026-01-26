import type { ExpandedState, RowSelectionState } from '@tanstack/react-table';
import { ArrowDownAZ, ArrowUpAZ, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { BatchProgress } from '../hooks/useBatchStatusUpdates';
import type { BatchListItem, BatchSortField, BatchSortOrder, BatchStatusFilter, Candidate } from '../types';
import { BatchCard } from './BatchCard';
import { BatchTableSkeleton } from './BatchTableSkeleton';

interface BatchListCardProps {
	batches: BatchListItem[];
	isLoading: boolean;
	isError: boolean;
	searchQuery: string;
	isSearching: boolean;
	statusFilter: BatchStatusFilter | 'all';
	sortBy: BatchSortField;
	sortOrder: BatchSortOrder;
	hasActiveFilters: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	rowSelection: RowSelectionState;
	expandedRows: ExpandedState;
	onSearchChange: (value: string) => void;
	onStatusFilterChange: (value: BatchStatusFilter | 'all') => void;
	onSortByChange: (value: BatchSortField) => void;
	onSortOrderToggle: () => void;
	onClearFilters: () => void;
	onRefetch: () => void;
	onFetchNextPage: () => void;
	onRowSelectionChange: (selection: RowSelectionState) => void;
	onToggleExpanded: (batchId: string) => void;
	onViewDetails: (batch: BatchListItem) => void;
	onAcceptAllReady: (batch: BatchListItem) => void;
	onRetry: (batch: BatchListItem) => void;
	onDelete: (batch: BatchListItem) => void;
	onFetchCandidates: (batchId: string) => Promise<Candidate[]>;
	acceptingBatches: Set<string>;
	retryingBatches: Set<string>;
	deletingBatches: Set<string>;
	batchProgress: Map<string, BatchProgress>;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Card wrapper handles search, filters, loading states, and batch grid rendering
export function BatchListCard({
	batches,
	isLoading,
	isError,
	searchQuery,
	isSearching,
	statusFilter,
	sortBy,
	sortOrder,
	hasActiveFilters,
	hasNextPage,
	isFetchingNextPage,
	rowSelection,
	expandedRows,
	onSearchChange,
	onStatusFilterChange,
	onSortByChange,
	onSortOrderToggle,
	onClearFilters,
	onRefetch,
	onFetchNextPage,
	onRowSelectionChange,
	onToggleExpanded,
	onViewDetails,
	onAcceptAllReady,
	onRetry,
	onDelete,
	onFetchCandidates,
	acceptingBatches,
	retryingBatches,
	deletingBatches,
	batchProgress,
}: BatchListCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent batches</CardTitle>
				<CardDescription>View and manage your submitted batches</CardDescription>
			</CardHeader>

			<CardContent>
				{/* Search and Filter Bar */}
				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
					{/* Search Input */}
					<div className="relative flex-1 min-w-full sm:min-w-[240px]">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
						<Input
							type="text"
							placeholder="Search terms..."
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
							className="pl-9 pr-9"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => onSearchChange('')}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
								aria-label="Clear search"
							>
								<X className="h-4 w-4" />
							</button>
						)}
					</div>

					<div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
						{/* Status Filter */}
						<Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as BatchStatusFilter | 'all')}>
							<SelectTrigger className="w-full sm:w-[140px]" size="sm">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All statuses</SelectItem>
								<SelectItem value="captured">Captured</SelectItem>
								<SelectItem value="suggested">Suggested</SelectItem>
								<SelectItem value="accepted">Accepted</SelectItem>
							</SelectContent>
						</Select>

						{/* Sort Options */}
						<Select value={sortBy} onValueChange={(value) => onSortByChange(value as BatchSortField)}>
							<SelectTrigger className="w-full sm:w-[150px]" size="sm">
								<SelectValue placeholder="Sort by" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="created">Date created</SelectItem>
								<SelectItem value="candidateCount">Term count</SelectItem>
								<SelectItem value="acceptanceRate">Acceptance %</SelectItem>
							</SelectContent>
						</Select>

						{/* Sort Order Toggle */}
						<TooltipProvider delayDuration={300}>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onSortOrderToggle}>
										{sortOrder === 'desc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
									</Button>
								</TooltipTrigger>
								<TooltipContent>{sortOrder === 'desc' ? 'Descending' : 'Ascending'}</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						{/* Clear Filters */}
						{hasActiveFilters && (
							<Button variant="ghost" size="sm" onClick={onClearFilters} className="text-zinc-500 hover:text-zinc-300 whitespace-nowrap">
								Clear filters
							</Button>
						)}
					</div>
				</div>

				{/* Search Status */}
				{isSearching && (
					<div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
						<span>Searching...</span>
					</div>
				)}

				{/* Content */}
				{isLoading ? (
					// Loading skeleton
					<BatchTableSkeleton rows={5} />
				) : isError ? (
					// Error state
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<p className="text-zinc-400">Failed to load batches. Please try again.</p>
						<Button variant="secondary" onClick={onRefetch} className="mt-4">
							Retry
						</Button>
					</div>
				) : batches.length === 0 ? (
					// Empty state
					<div className="flex flex-col items-center justify-center py-12 text-center">
						{hasActiveFilters ? (
							<>
								<p className="text-zinc-400">No batches match your filters.</p>
								<Button variant="secondary" onClick={onClearFilters} className="mt-4">
									Clear filters
								</Button>
							</>
						) : (
							<p className="text-zinc-400">No batches yet. Submit your first batch above to get started.</p>
						)}
					</div>
				) : (
					// Card grid
					<>
						<div className="grid grid-cols-1 gap-4">
							{batches.map((batch) => {
								const isSelected = rowSelection[batch.id] === true;
								// Handle expandedRows being either boolean or object
								const isExpanded = typeof expandedRows === 'boolean' ? expandedRows : expandedRows[batch.id] === true;

								return (
									<BatchCard
										key={batch.id}
										batch={batch}
										isSelected={isSelected}
										isExpanded={isExpanded}
										onToggleSelection={(checked) => {
											onRowSelectionChange({
												...rowSelection,
												[batch.id]: checked,
											});
										}}
										onToggleExpanded={() => onToggleExpanded(batch.id)}
										onViewDetails={() => onViewDetails(batch)}
										onAcceptAllReady={() => onAcceptAllReady(batch)}
										onRetry={() => onRetry(batch)}
										onDelete={() => onDelete(batch)}
										onFetchCandidates={onFetchCandidates}
										isAccepting={acceptingBatches.has(batch.id)}
										isRetrying={retryingBatches.has(batch.id)}
										isDeleting={deletingBatches.has(batch.id)}
										batchProgress={batchProgress.get(batch.id)}
									/>
								);
							})}
						</div>

						{/* Load more button */}
						{hasNextPage && (
							<div className="mt-6 flex justify-center">
								<Button variant="secondary" onClick={onFetchNextPage} disabled={isFetchingNextPage}>
									{isFetchingNextPage && <Loader2 className="size-4 animate-spin mr-2" />}
									Load more
								</Button>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
