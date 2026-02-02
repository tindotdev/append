import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ExpandedState, RowSelectionState } from '@tanstack/react-table';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getBatch } from '../api/get-batch';
import { type BatchesFilterOptions, useBatches } from '../api/list-batches';
import { BatchBulkActionBar } from '../components/BatchBulkActionBar';
import { BatchErrorBoundary } from '../components/BatchErrorBoundary';
import { BatchListCard } from '../components/BatchListCard';
import { NewBatchCard } from '../components/NewBatchCard';
import { useBatchActions } from '../hooks/useBatchActions';
import { useBatchStatusUpdates } from '../hooks/useBatchStatusUpdates';
import {
	getInputClassName,
	TERM_COMPOSER_MAX,
	useTermComposer,
	validateTerm,
	validationDotClass,
	validationMessageClass,
} from '../hooks/useTermComposer';
import type { BatchListItem, BatchSortField, BatchSortOrder, BatchStatusFilter, Candidate } from '../types';

// --- Component ---
export function BatchNewPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Term composer hook
	const composer = useTermComposer();

	// Real-time batch status updates via SSE
	const { trackBatch, progress: batchProgress } = useBatchStatusUpdates({
		showToasts: true,
		autoRefresh: true,
	});

	// Batch action handlers
	const actions = useBatchActions(queryClient, trackBatch);

	// Table state
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
	const [previousBatchIds, setPreviousBatchIds] = useState<Set<string>>(new Set());

	// Search, filter, and sort state
	const [searchQuery, setSearchQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState<BatchStatusFilter | 'all'>('all');
	const [sortBy, setSortBy] = useState<BatchSortField>('created');
	const [sortOrder, setSortOrder] = useState<BatchSortOrder>('desc');

	// Defer search query to avoid blocking UI while typing
	const deferredSearch = useDeferredValue(searchQuery);
	const isSearching = searchQuery !== deferredSearch;

	// Build filter options for the hook
	const filterOptions = useMemo<BatchesFilterOptions>(
		() => ({
			search: deferredSearch || undefined,
			status: statusFilter !== 'all' ? statusFilter : undefined,
			sortBy,
			sortOrder,
		}),
		[deferredSearch, statusFilter, sortBy, sortOrder]
	);

	// Fetch batches for the table with filters
	const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useBatches(filterOptions);
	const batches = data?.pages.flatMap((page) => page.batches) ?? [];

	// Check if any filters are active
	const hasActiveFilters = Boolean(deferredSearch) || statusFilter !== 'all';

	// Clear all filters
	const handleClearFilters = useCallback(() => {
		setSearchQuery('');
		setStatusFilter('all');
	}, []);

	const batchListRef = useRef<HTMLDivElement>(null);

	// Auto-expand and scroll to newly created batch
	useEffect(() => {
		if (!composer.justSubmitted || !batches.length) return;

		const currentBatchIds = new Set(batches.map((b) => b.id));
		const newBatches = batches.filter((b) => !previousBatchIds.has(b.id));

		if (newBatches.length > 0) {
			const newestBatch = newBatches[0];
			setExpandedRows((prev) => {
				const prevObj = typeof prev === 'object' ? prev : {};
				return { ...prevObj, [newestBatch.id]: true };
			});

			if (batchListRef.current) {
				batchListRef.current.scrollIntoView({
					behavior: 'smooth',
					block: 'start',
				});
			}

			composer.setJustSubmitted(false);
		}

		setPreviousBatchIds(currentBatchIds);
	}, [batches, composer.justSubmitted, previousBatchIds, composer.setJustSubmitted]);

	// Batch table action handlers
	const handleViewDetails = useCallback(
		(batch: BatchListItem) => {
			navigate({ to: '/batch/$batchId', params: { batchId: batch.id } });
		},
		[navigate]
	);

	// Fetch candidates for expanded row preview
	const handleFetchCandidates = useCallback(async (batchId: string): Promise<Candidate[]> => {
		const data = await getBatch(batchId);
		return data.candidates;
	}, []);

	// Get selected batch IDs from row selection
	const selectedBatchIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
	const selectedCount = selectedBatchIds.length;

	// Bulk action wrappers that clear selection on success
	const handleBulkAcceptAllReady = useCallback(async () => {
		const shouldClear = await actions.handleBulkAcceptAllReady(selectedBatchIds);
		if (shouldClear) setRowSelection({});
	}, [selectedBatchIds, actions.handleBulkAcceptAllReady]);

	const handleBulkRetry = useCallback(async () => {
		const shouldClear = await actions.handleBulkRetry(selectedBatchIds);
		if (shouldClear) setRowSelection({});
	}, [selectedBatchIds, actions.handleBulkRetry]);

	const handleBulkDeleteRequest = useCallback(() => {
		actions.handleBulkDeleteRequest(selectedBatchIds);
	}, [selectedBatchIds, actions.handleBulkDeleteRequest]);

	const handleBulkDeleteConfirm = useCallback(async () => {
		const shouldClear = await actions.handleBulkDeleteConfirm(selectedBatchIds);
		if (shouldClear) setRowSelection({});
	}, [selectedBatchIds, actions.handleBulkDeleteConfirm]);

	const handleClearSelection = useCallback(() => {
		setRowSelection({});
	}, []);

	// Toggle expanded state for a specific batch
	const handleToggleExpanded = useCallback((batchId: string) => {
		setExpandedRows((prev) => {
			const prevObj = typeof prev === 'object' ? prev : {};
			return { ...prevObj, [batchId]: !prevObj[batchId] };
		});
	}, []);

	return (
		<BatchErrorBoundary>
			<div className="w-full space-y-8">
				{/* Capture Section */}
				<NewBatchCard
					rows={composer.rows}
					isSubmitting={composer.isSubmitting}
					canSubmit={composer.canSubmit}
					validTermCount={composer.validTermCount}
					termMax={TERM_COMPOSER_MAX}
					onRowChange={composer.handleRowChange}
					onRowPaste={composer.handleRowPaste}
					onRowKeyDown={composer.handleRowKeyDown}
					onRemoveRow={composer.handleRemoveRow}
					onClearDraft={composer.handleClearDraft}
					onSubmit={composer.handleSubmit}
					inputRefs={composer.inputRefs}
					validateTerm={validateTerm}
					validationDotClass={validationDotClass}
					validationMessageClass={validationMessageClass}
					getInputClassName={getInputClassName}
				/>

				{/* Recent Batches Section */}
				<div ref={batchListRef}>
					<BatchListCard
						batches={batches}
						isLoading={isLoading}
						isError={isError}
						searchQuery={searchQuery}
						isSearching={isSearching}
						statusFilter={statusFilter}
						sortBy={sortBy}
						sortOrder={sortOrder}
						hasActiveFilters={hasActiveFilters}
						hasNextPage={hasNextPage ?? false}
						isFetchingNextPage={isFetchingNextPage}
						rowSelection={rowSelection}
						expandedRows={expandedRows}
						onSearchChange={setSearchQuery}
						onStatusFilterChange={setStatusFilter}
						onSortByChange={setSortBy}
						onSortOrderToggle={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
						onClearFilters={handleClearFilters}
						onRefetch={refetch}
						onFetchNextPage={fetchNextPage}
						onRowSelectionChange={setRowSelection}
						onToggleExpanded={handleToggleExpanded}
						onViewDetails={handleViewDetails}
						onAcceptAllReady={actions.handleAcceptAllReady}
						onRetry={actions.handleRetry}
						onDelete={actions.handleDelete}
						onFetchCandidates={handleFetchCandidates}
						acceptingBatches={actions.acceptingBatches}
						retryingBatches={actions.retryingBatches}
						deletingBatches={actions.deletingBatches}
						batchProgress={batchProgress}
					/>
				</div>

				{/* Delete Confirmation Dialog */}
				<Dialog open={!!actions.batchToDelete} onOpenChange={(open) => !open && actions.setBatchToDelete(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete Batch</DialogTitle>
							<DialogDescription>
								Are you sure you want to delete this batch with {actions.batchToDelete?.candidateCount ?? 0} term
								{actions.batchToDelete?.candidateCount !== 1 ? 's' : ''}? This action cannot be undone.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="secondary">Cancel</Button>
							</DialogClose>
							<Button variant="destructive" onClick={actions.handleConfirmDelete}>
								Delete
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Bulk Delete Confirmation Dialog */}
				<Dialog open={actions.showBulkDeleteConfirm} onOpenChange={actions.setShowBulkDeleteConfirm}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete {selectedCount} Batches</DialogTitle>
							<DialogDescription>
								Are you sure you want to delete {selectedCount} batch
								{selectedCount !== 1 ? 'es' : ''} and all their candidates? This action cannot be undone.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="secondary">Cancel</Button>
							</DialogClose>
							<Button variant="destructive" onClick={handleBulkDeleteConfirm}>
								Delete {selectedCount} Batches
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Bulk Action Bar */}
				<BatchBulkActionBar
					selectedCount={selectedCount}
					isAccepting={actions.isBulkAccepting}
					isRetrying={actions.isBulkRetrying}
					isDeleting={actions.isBulkDeleting}
					onClear={handleClearSelection}
					onAcceptAllReady={handleBulkAcceptAllReady}
					onRetry={handleBulkRetry}
					onDelete={handleBulkDeleteRequest}
				/>
			</div>
		</BatchErrorBoundary>
	);
}
