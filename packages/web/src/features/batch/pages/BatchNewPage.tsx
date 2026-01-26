import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ExpandedState, RowSelectionState } from '@tanstack/react-table';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useOutboxSafe } from '@/features/outbox';
import { ApiRequestError } from '@/lib/api-rpc';
import { UNDO_GRACE_MS } from '@/lib/outbox-adapter';
import { acceptBatch } from '../api/accept-batch';
import { bulkAcceptBatches } from '../api/bulk-accept';
import { bulkDeleteBatches } from '../api/bulk-delete';
import { deleteBatch } from '../api/delete-batch';
import { batchKeys, getBatch } from '../api/get-batch';
import { type BatchesFilterOptions, useBatches } from '../api/list-batches';
import { BatchBulkActionBar } from '../components/BatchBulkActionBar';
import { BatchErrorBoundary } from '../components/BatchErrorBoundary';
import { BatchListCard } from '../components/BatchListCard';
import { NewBatchCard } from '../components/NewBatchCard';
import { useBatchStatusUpdates } from '../hooks/useBatchStatusUpdates';
import type { BatchListItem, BatchSortField, BatchSortOrder, BatchStatusFilter, Candidate } from '../types';

// --- Constants ---
const TERM_MIN = 1;
const TERM_MAX = 200;
const TERM_CHAR_MAX = 200;
const FORBIDDEN_DELIMITER = ': ';
const STORAGE_KEY = 'append.captureDraft.v1';

// --- Types ---
interface TermRow {
	id: string;
	value: string;
}

type ValidationStatus = 'valid' | 'empty' | 'too-long' | 'forbidden-delimiter' | 'duplicate';

interface TermValidation {
	status: ValidationStatus;
	message?: string;
}

// --- Validation ---
function validateTerm(value: string, existingTerms: string[], currentIndex: number): TermValidation {
	const trimmed = value.trim();

	if (!trimmed) {
		return { status: 'empty' };
	}

	if (trimmed.length > TERM_CHAR_MAX) {
		return { status: 'too-long', message: `Max ${TERM_CHAR_MAX} characters` };
	}

	if (trimmed.includes(FORBIDDEN_DELIMITER)) {
		return { status: 'forbidden-delimiter', message: 'Cannot contain ": "' };
	}

	// Check for duplicates (case-insensitive)
	const normalized = trimmed.toLowerCase();
	const isDuplicate = existingTerms.some((t, i) => i < currentIndex && t.trim().toLowerCase() === normalized);
	if (isDuplicate) {
		return { status: 'duplicate', message: 'Duplicate (allowed)' };
	}

	return { status: 'valid' };
}

const validationDotClass: Record<ValidationStatus, string> = {
	valid: 'bg-green-500',
	duplicate: 'bg-amber-500',
	'too-long': 'bg-red-500',
	'forbidden-delimiter': 'bg-red-500',
	empty: 'bg-zinc-600',
};

const validationMessageClass: Partial<Record<ValidationStatus, string>> = {
	duplicate: 'text-amber-400',
	'too-long': 'text-red-400',
	'forbidden-delimiter': 'text-red-400',
};

function getInputClassName(hasError: boolean): string {
	if (!hasError) {
		return 'pr-20';
	}

	return 'pr-20 border-red-500 focus-visible:ring-red-500';
}

// --- Local Storage ---
function loadDraft(): TermRow[] {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed) && parsed.every((r) => r.id && typeof r.value === 'string')) {
				return parsed;
			}
		}
	} catch {
		// Ignore parse errors
	}
	return [{ id: crypto.randomUUID(), value: '' }];
}

function saveDraft(rows: TermRow[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
	} catch (err) {
		console.warn('Failed to save draft to localStorage:', err);
		toast.warning('Unable to save draft. Your changes may be lost on page refresh.');
	}
}

function clearDraft(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore storage errors
	}
}

// --- Component ---
export function BatchNewPage() {
	// Use safe hook that won't throw during initialization
	const outbox = useOutboxSafe();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [rows, setRows] = useState<TermRow[]>(() => loadDraft());
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [expandedRows, setExpandedRows] = useState<ExpandedState>({});
	const [justSubmitted, setJustSubmitted] = useState(false);
	const [previousBatchIds, setPreviousBatchIds] = useState<Set<string>>(new Set());

	// Real-time batch status updates via SSE
	const { trackBatch, progress: batchProgress } = useBatchStatusUpdates({
		showToasts: true,
		autoRefresh: true,
	});

	// Action loading states: Map of batchId -> action type
	const [acceptingBatches, setAcceptingBatches] = useState<Set<string>>(new Set());
	const [retryingBatches, setRetryingBatches] = useState<Set<string>>(new Set());
	const [deletingBatches, setDeletingBatches] = useState<Set<string>>(new Set());

	// Delete confirmation dialog state
	const [batchToDelete, setBatchToDelete] = useState<BatchListItem | null>(null);

	// Bulk operations state
	const [isBulkAccepting, setIsBulkAccepting] = useState(false);
	const [isBulkRetrying, setIsBulkRetrying] = useState(false);
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

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

	// Refs for focus management
	const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
	const focusRowId = useRef<string | null>(null);
	const batchListRef = useRef<HTMLDivElement>(null);

	// Save draft on changes
	useEffect(() => {
		saveDraft(rows);
	}, [rows]);

	// Focus management after state updates
	useEffect(() => {
		if (focusRowId.current) {
			const input = inputRefs.current.get(focusRowId.current);
			if (input) {
				input.focus();
				// Move cursor to end
				input.setSelectionRange(input.value.length, input.value.length);
			}
			focusRowId.current = null;
		}
	});

	// Auto-expand and scroll to newly created batch
	useEffect(() => {
		if (!justSubmitted || !batches.length) return;

		// Get current batch IDs
		const currentBatchIds = new Set(batches.map((b) => b.id));

		// Find new batches (in current but not in previous)
		const newBatches = batches.filter((b) => !previousBatchIds.has(b.id));

		if (newBatches.length > 0) {
			// Auto-expand the first new batch (most recent)
			const newestBatch = newBatches[0];
			setExpandedRows((prev) => {
				const prevObj = typeof prev === 'object' ? prev : {};
				return { ...prevObj, [newestBatch.id]: true };
			});

			// Scroll to batch list section
			if (batchListRef.current) {
				batchListRef.current.scrollIntoView({
					behavior: 'smooth',
					block: 'start',
				});
			}

			// Reset the flag
			setJustSubmitted(false);
		}

		// Update previous batch IDs
		setPreviousBatchIds(currentBatchIds);
	}, [batches, justSubmitted, previousBatchIds]);

	// Get all term values for duplicate checking
	const termValues = rows.map((r) => r.value);

	// Count valid (non-empty) terms
	const validTermCount = rows.filter((r) => r.value.trim()).length;

	// Check if form is submittable
	const hasValidationErrors = rows.some((r, i) => {
		const validation = validateTerm(r.value, termValues, i);
		return validation.status === 'too-long' || validation.status === 'forbidden-delimiter';
	});
	// Also require outbox to be initialized
	const canSubmit = Boolean(outbox && validTermCount >= TERM_MIN && validTermCount <= TERM_MAX && !hasValidationErrors && !isSubmitting);

	const handleRowChange = useCallback((id: string, value: string) => {
		setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
	}, []);

	const handleRowPaste = useCallback((id: string, e: React.ClipboardEvent<HTMLInputElement>) => {
		const pastedText = e.clipboardData.getData('text');
		const lines = pastedText.split(/\r?\n/).filter((line) => line.trim());

		// If pasting multiple lines, split into rows
		if (lines.length > 1) {
			e.preventDefault();

			setRows((prev) => {
				const index = prev.findIndex((r) => r.id === id);
				if (index === -1) return prev;

				const newRows = lines.map((line) => ({
					id: crypto.randomUUID(),
					value: line.trim(),
				}));

				// Replace current row with first line, insert rest after
				const result = [...prev.slice(0, index), ...newRows, ...prev.slice(index + 1)];

				// Focus the last pasted row
				focusRowId.current = newRows[newRows.length - 1].id;

				return result;
			});
		}
	}, []);

	const handleRemoveRow = useCallback((id: string) => {
		setRows((prev) => {
			if (prev.length <= 1) {
				// If last row, just clear it
				return [{ id: prev[0].id, value: '' }];
			}
			return prev.filter((r) => r.id !== id);
		});
	}, []);

	const handleAddRow = useCallback(() => {
		const newRow: TermRow = { id: crypto.randomUUID(), value: '' };
		setRows((prev) => [...prev, newRow]);
		focusRowId.current = newRow.id;
	}, []);

	const handleClearDraft = useCallback(() => {
		clearDraft();
		setRows([{ id: crypto.randomUUID(), value: '' }]);
	}, []);

	// Helper to restore draft from terms string
	const restoreDraft = useCallback((termsString: string) => {
		const lines = termsString.split('\n').filter(Boolean);
		const newRows =
			lines.length > 0 ? lines.map((line) => ({ id: crypto.randomUUID(), value: line })) : [{ id: crypto.randomUUID(), value: '' }];
		setRows(newRows);
		saveDraft(newRows);
	}, []);

	const handleSubmit = useCallback(async () => {
		if (!canSubmit || !outbox) return;

		setIsSubmitting(true);

		try {
			// Collect non-empty terms
			const terms = rows.map((r) => r.value.trim()).filter(Boolean);
			const termsInput = terms.join('\n');

			// Enqueue to outbox (instant, durable)
			const { item } = await outbox.enqueue({ terms: termsInput });

			// Clear composer immediately, stay on page
			clearDraft();
			setRows([{ id: crypto.randomUUID(), value: '' }]);

			// Mark as just submitted to trigger auto-expand on next refetch
			setJustSubmitted(true);

			// Show toast with Undo action
			toast.info('Queued for sync', {
				duration: UNDO_GRACE_MS,
				action: {
					label: 'Undo',
					onClick: async () => {
						const result = await outbox.undo(item.id);
						if (result.success && result.command?.type === 'capture_terms') {
							restoreDraft(result.command.request.terms);
							setJustSubmitted(false); // Cancel auto-expand if undo
							toast.success('Restored to composer');
						} else {
							toast.error('Cannot undo — already sent');
						}
					},
				},
			});
		} catch {
			toast.error('Failed to queue. Please try again.');
			setJustSubmitted(false); // Reset flag on error
		} finally {
			setIsSubmitting(false);
		}
	}, [canSubmit, outbox, rows, restoreDraft]);

	const handleRowKeyDown = useCallback(
		(id: string, e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				// Add new row below and focus it
				const newRow: TermRow = { id: crypto.randomUUID(), value: '' };
				setRows((prev) => {
					const index = prev.findIndex((r) => r.id === id);
					if (index === -1) return prev;
					return [...prev.slice(0, index + 1), newRow, ...prev.slice(index + 1)];
				});
				focusRowId.current = newRow.id;
			} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault();
				if (canSubmit) {
					handleSubmit();
				}
			} else if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
				// Remove empty row on backspace and focus previous
				e.preventDefault();
				setRows((prev) => {
					if (prev.length <= 1) return prev;
					const index = prev.findIndex((r) => r.id === id);
					if (index === -1) return prev;
					// Focus previous row (or next if first)
					const focusIndex = index > 0 ? index - 1 : 1;
					focusRowId.current = prev[focusIndex]?.id ?? null;
					return prev.filter((r) => r.id !== id);
				});
			}
		},
		[canSubmit, handleSubmit]
	);

	// Batch table action handlers
	const handleViewDetails = useCallback(
		(batch: BatchListItem) => {
			navigate({ to: '/batch/$batchId', params: { batchId: batch.id } });
		},
		[navigate]
	);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles accept with error cases and conflict detection
	const handleAcceptAllReady = useCallback(
		async (batch: BatchListItem) => {
			// Skip if already accepting this batch
			if (acceptingBatches.has(batch.id)) return;

			setAcceptingBatches((prev) => new Set(prev).add(batch.id));

			try {
				const summary = await acceptBatch(batch.id);
				toast.success(`Accepted ${summary.acceptedCount} terms (${summary.termCreatedCount} new terms created)`);

				// Invalidate the batches list to refetch updated data
				await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
			} catch (err) {
				if (err instanceof ApiRequestError) {
					if (err.status === 409) {
						const reason = err.details?.reason as string | undefined;
						if (reason === 'SUGGESTIONS_IN_PROGRESS') {
							toast.error('Cannot accept: some suggestions are still being generated.');
						} else if (reason === 'MISSING_EFFECTIVE_FIELDS') {
							toast.error('Cannot accept: some candidates are missing bucket or text.');
						} else {
							toast.error('Cannot accept: please refresh and try again.');
						}
					} else {
						toast.error('Accept failed. Please try again.');
					}
				} else {
					toast.error('Accept failed. Please try again.');
				}
			} finally {
				setAcceptingBatches((prev) => {
					const next = new Set(prev);
					next.delete(batch.id);
					return next;
				});
			}
		},
		[acceptingBatches, queryClient]
	);

	const handleRetry = useCallback(
		async (batch: BatchListItem) => {
			// Skip if already retrying this batch
			if (retryingBatches.has(batch.id)) return;

			setRetryingBatches((prev) => new Set(prev).add(batch.id));

			try {
				// Use trackBatch for real-time updates
				await trackBatch(batch.id);
			} catch {
				// Error handling is done in the hook
			} finally {
				setRetryingBatches((prev) => {
					const next = new Set(prev);
					next.delete(batch.id);
					return next;
				});
			}
		},
		[retryingBatches, trackBatch]
	);

	const handleDelete = useCallback((batch: BatchListItem) => {
		// Show confirmation dialog
		setBatchToDelete(batch);
	}, []);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles delete with error cases and state cleanup
	const handleConfirmDelete = useCallback(async () => {
		if (!batchToDelete) return;
		if (deletingBatches.has(batchToDelete.id)) return;

		const batch = batchToDelete;
		setBatchToDelete(null);
		setDeletingBatches((prev) => new Set(prev).add(batch.id));

		try {
			await deleteBatch(batch.id);
			toast.success(`Deleted batch with ${batch.candidateCount} terms`);

			// Invalidate the batches list to refetch updated data
			await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
		} catch (err) {
			if (err instanceof ApiRequestError) {
				if (err.status === 404) {
					toast.error('Batch not found. It may have already been deleted.');
					await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
				} else {
					toast.error('Failed to delete batch. Please try again.');
				}
			} else {
				toast.error('Failed to delete batch. Please try again.');
			}
		} finally {
			setDeletingBatches((prev) => {
				const next = new Set(prev);
				next.delete(batch.id);
				return next;
			});
		}
	}, [batchToDelete, deletingBatches, queryClient]);

	// Fetch candidates for expanded row preview
	const handleFetchCandidates = useCallback(async (batchId: string): Promise<Candidate[]> => {
		const data = await getBatch(batchId);
		return data.candidates;
	}, []);

	// Get selected batch IDs from row selection
	const selectedBatchIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
	const selectedCount = selectedBatchIds.length;

	// Bulk action handlers
	const handleBulkAcceptAllReady = useCallback(async () => {
		if (selectedBatchIds.length === 0) return;
		if (isBulkAccepting) return;

		setIsBulkAccepting(true);

		try {
			const summary = await bulkAcceptBatches(selectedBatchIds);

			// Show appropriate toast based on results
			if (summary.failureCount === 0) {
				const totalAccepted = summary.results.reduce((acc, r) => acc + (r.acceptedCount ?? 0), 0);
				const totalTermsCreated = summary.results.reduce((acc, r) => acc + (r.termCreatedCount ?? 0), 0);
				toast.success(`Accepted ${totalAccepted} terms across ${summary.successCount} batches (${totalTermsCreated} new terms created)`);
			} else if (summary.successCount === 0) {
				toast.error('Failed to accept all batches. Please check individual batch status.');
			} else {
				const totalAccepted = summary.results.reduce((acc, r) => acc + (r.acceptedCount ?? 0), 0);
				toast.warning(`Accepted ${totalAccepted} terms in ${summary.successCount} batches, ${summary.failureCount} failed`);
			}

			// Clear selection and refresh
			setRowSelection({});
			await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
		} catch {
			toast.error('Failed to accept batches. Please try again.');
		} finally {
			setIsBulkAccepting(false);
		}
	}, [selectedBatchIds, isBulkAccepting, queryClient]);

	const handleBulkRetry = useCallback(async () => {
		if (selectedBatchIds.length === 0) return;
		if (isBulkRetrying) return;

		setIsBulkRetrying(true);

		let successCount = 0;
		let failedCount = 0;

		// Process batches sequentially using trackBatch for real-time updates
		for (const batchId of selectedBatchIds) {
			try {
				await trackBatch(batchId);
				successCount++;
			} catch {
				failedCount++;
			}
		}

		// Show appropriate toast (individual batch toasts are handled by the hook)
		if (failedCount > 0 && successCount > 0) {
			toast.warning(`Completed ${successCount} batches, ${failedCount} failed`);
		} else if (failedCount > 0) {
			toast.error('Failed to retry all batches. Please try again.');
		}

		// Clear selection (list refresh is handled by the hook)
		setRowSelection({});
		setIsBulkRetrying(false);
	}, [selectedBatchIds, isBulkRetrying, trackBatch]);

	const handleBulkDeleteRequest = useCallback(() => {
		if (selectedBatchIds.length === 0) return;
		setShowBulkDeleteConfirm(true);
	}, [selectedBatchIds]);

	const handleBulkDeleteConfirm = useCallback(async () => {
		if (selectedBatchIds.length === 0) return;
		if (isBulkDeleting) return;

		setShowBulkDeleteConfirm(false);
		setIsBulkDeleting(true);

		try {
			const summary = await bulkDeleteBatches(selectedBatchIds);

			// Show appropriate toast based on results
			if (summary.failureCount === 0) {
				toast.success(`Deleted ${summary.successCount} batches`);
			} else if (summary.successCount === 0) {
				toast.error('Failed to delete all batches. Please try again.');
			} else {
				toast.warning(`Deleted ${summary.successCount} batches, ${summary.failureCount} failed`);
			}

			// Clear selection and refresh
			setRowSelection({});
			await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
		} catch {
			toast.error('Failed to delete batches. Please try again.');
		} finally {
			setIsBulkDeleting(false);
		}
	}, [selectedBatchIds, isBulkDeleting, queryClient]);

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
					rows={rows}
					isSubmitting={isSubmitting}
					canSubmit={canSubmit}
					validTermCount={validTermCount}
					termMin={TERM_MIN}
					termMax={TERM_MAX}
					onRowChange={handleRowChange}
					onRowPaste={handleRowPaste}
					onRowKeyDown={handleRowKeyDown}
					onRemoveRow={handleRemoveRow}
					onAddRow={handleAddRow}
					onClearDraft={handleClearDraft}
					onSubmit={handleSubmit}
					inputRefs={inputRefs}
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
						onAcceptAllReady={handleAcceptAllReady}
						onRetry={handleRetry}
						onDelete={handleDelete}
						onFetchCandidates={handleFetchCandidates}
						acceptingBatches={acceptingBatches}
						retryingBatches={retryingBatches}
						deletingBatches={deletingBatches}
						batchProgress={batchProgress}
					/>
				</div>

				{/* Delete Confirmation Dialog */}
				<Dialog open={!!batchToDelete} onOpenChange={(open) => !open && setBatchToDelete(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete Batch</DialogTitle>
							<DialogDescription>
								Are you sure you want to delete this batch with {batchToDelete?.candidateCount ?? 0} term
								{batchToDelete?.candidateCount !== 1 ? 's' : ''}? This action cannot be undone.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="secondary">Cancel</Button>
							</DialogClose>
							<Button variant="destructive" onClick={handleConfirmDelete}>
								Delete
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Bulk Delete Confirmation Dialog */}
				<Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
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
					isAccepting={isBulkAccepting}
					isRetrying={isBulkRetrying}
					isDeleting={isBulkDeleting}
					onClear={handleClearSelection}
					onAcceptAllReady={handleBulkAcceptAllReady}
					onRetry={handleBulkRetry}
					onDelete={handleBulkDeleteRequest}
				/>
			</div>
		</BatchErrorBoundary>
	);
}
