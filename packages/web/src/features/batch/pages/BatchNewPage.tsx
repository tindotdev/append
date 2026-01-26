import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ExpandedState, RowSelectionState } from '@tanstack/react-table';
import { ArrowDownAZ, ArrowUpAZ, Loader2, Search, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { BatchTable } from '../components/BatchTable';
import { BatchTableSkeleton } from '../components/BatchTableSkeleton';
import { type BatchColumnMeta, getBatchColumns } from '../components/batch-columns';
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Main page component orchestrates capture form, batch list, and real-time updates
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
	const canSubmit = outbox && validTermCount >= TERM_MIN && validTermCount <= TERM_MAX && !hasValidationErrors && !isSubmitting;

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

	// Column metadata
	const columnMeta: BatchColumnMeta = {
		onViewDetails: handleViewDetails,
		onAcceptAllReady: handleAcceptAllReady,
		onRetry: handleRetry,
		onDelete: handleDelete,
		acceptingBatches,
		retryingBatches,
		deletingBatches,
		batchProgress,
	};

	const columns = getBatchColumns(columnMeta);

	return (
		<BatchErrorBoundary>
			<div className="w-full space-y-8">
				{/* Capture Section */}
				<div className="space-y-6">
					{/* Header */}
					<div className="flex items-start justify-between gap-4">
						<div className="flex-1 space-y-1.5">
							<h2 className="text-xl font-semibold tracking-tight">Capture</h2>
							<p className="text-sm text-zinc-400">Enter terms, one per row. Brain dump welcome.</p>
						</div>
						{rows.some((r) => r.value.trim()) && (
							<Button variant="ghost" size="sm" onClick={handleClearDraft} className="text-zinc-500 hover:text-zinc-300 shrink-0">
								Clear draft
							</Button>
						)}
					</div>

					{/* Term Input Rows */}
					<div className="space-y-2">
						{rows.map((row, index) => {
							const validation = validateTerm(row.value, termValues, index);
							const hasError = validation.status === 'too-long' || validation.status === 'forbidden-delimiter';
							const messageClass = validationMessageClass[validation.status];
							const showMessage = Boolean(messageClass && validation.message);
							const dotClass = validationDotClass[validation.status] ?? 'bg-zinc-600';

							return (
								<div key={row.id} className="group flex items-center gap-2.5">
									<div className="flex h-9 w-8 shrink-0 items-center justify-center">
										<span className={`h-2 w-2 rounded-full transition-colors ${dotClass}`} />
									</div>
									<div className="relative flex-1">
										<Input
											ref={(el) => {
												if (el) {
													inputRefs.current.set(row.id, el);
												} else {
													inputRefs.current.delete(row.id);
												}
											}}
											value={row.value}
											onChange={(e) => handleRowChange(row.id, e.target.value)}
											onPaste={(e) => handleRowPaste(row.id, e)}
											onKeyDown={(e) => handleRowKeyDown(row.id, e)}
											placeholder={index === 0 ? 'Type a term or paste many...' : ''}
											disabled={isSubmitting}
											className={getInputClassName(hasError)}
											aria-invalid={hasError}
										/>
										{showMessage && (
											<span className={`absolute right-10 top-1/2 -translate-y-1/2 text-xs ${messageClass}`}>{validation.message}</span>
										)}
									</div>
									<TooltipProvider delayDuration={300}>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="h-9 w-9 shrink-0 text-zinc-500 opacity-0 transition-all hover:text-zinc-300 group-hover:opacity-100 focus:opacity-100"
													onClick={() => handleRemoveRow(row.id)}
													disabled={isSubmitting}
													aria-label="Remove row"
												>
													<X className="h-4 w-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent side="right">Remove</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							);
						})}
					</div>

					{/* Bottom Actions Bar */}
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-zinc-800/50">
						<div className="flex items-center gap-4">
							<div className="text-sm text-zinc-500">
								<span className={validTermCount < TERM_MIN || validTermCount > TERM_MAX ? 'text-amber-400 font-medium' : 'font-medium'}>
									{validTermCount} term{validTermCount !== 1 ? 's' : ''}
								</span>
								<span className="mx-2 text-zinc-700">·</span>
								<span className="text-zinc-600">
									{TERM_MIN}–{TERM_MAX} allowed
								</span>
							</div>
							<Button variant="ghost" size="sm" onClick={handleAddRow} disabled={isSubmitting} className="text-zinc-400 hover:text-zinc-200 -ml-1">
								+ Add term
							</Button>
						</div>
						<div className="flex items-center gap-3">
							<span className="hidden text-xs text-zinc-500 sm:inline-flex sm:items-center sm:gap-1.5">
								<Kbd>⌘</Kbd>
								<Kbd>↵</Kbd>
								<span className="ml-1">to submit</span>
							</span>
							<Button onClick={handleSubmit} disabled={!canSubmit} size="default" className="shrink-0">
								{isSubmitting ? 'Submitting...' : 'Submit Batch'}
							</Button>
						</div>
					</div>
				</div>

				{/* Recent Batches Section */}
				<div ref={batchListRef} className="space-y-6 pt-4">
					<div className="space-y-1.5">
						<h3 className="text-lg font-semibold tracking-tight">Recent batches</h3>
						<p className="text-sm text-zinc-400">View and manage your submitted batches</p>
					</div>

					{/* Search and Filter Bar */}
					<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
						{/* Search Input */}
						<div className="relative flex-1 min-w-full sm:min-w-[240px]">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
							<Input
								type="text"
								placeholder="Search terms..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-9 pr-9"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery('')}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
									aria-label="Clear search"
								>
									<X className="h-4 w-4" />
								</button>
							)}
						</div>

						<div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
							{/* Status Filter */}
							<Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as BatchStatusFilter | 'all')}>
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
							<Select value={sortBy} onValueChange={(value) => setSortBy(value as BatchSortField)}>
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
										<Button
											variant="outline"
											size="icon"
											className="h-9 w-9 shrink-0"
											onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
										>
											{sortOrder === 'desc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
										</Button>
									</TooltipTrigger>
									<TooltipContent>{sortOrder === 'desc' ? 'Descending' : 'Ascending'}</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							{/* Clear Filters */}
							{hasActiveFilters && (
								<Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-zinc-500 hover:text-zinc-300 whitespace-nowrap">
									Clear filters
								</Button>
							)}
						</div>
					</div>

					{/* Search Status */}
					{isSearching && (
						<div className="flex items-center gap-2 text-sm text-zinc-500">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							<span>Searching...</span>
						</div>
					)}

					<div>
						{isLoading ? (
							// Loading skeleton
							<BatchTableSkeleton rows={5} />
						) : isError ? (
							// Error state
							<div className="flex flex-col items-center justify-center py-12 text-center">
								<p className="text-zinc-400">Failed to load batches. Please try again.</p>
								<Button variant="secondary" onClick={() => refetch()} className="mt-4">
									Retry
								</Button>
							</div>
						) : batches.length === 0 ? (
							// Empty state
							<div className="flex flex-col items-center justify-center py-12 text-center">
								{hasActiveFilters ? (
									<>
										<p className="text-zinc-400">No batches match your filters.</p>
										<Button variant="secondary" onClick={handleClearFilters} className="mt-4">
											Clear filters
										</Button>
									</>
								) : (
									<p className="text-zinc-400">No batches yet. Submit your first batch above to get started.</p>
								)}
							</div>
						) : (
							// Table with batches
							<>
								<BatchTable
									columns={columns}
									data={batches}
									onRowClick={handleViewDetails}
									rowSelection={rowSelection}
									onRowSelectionChange={setRowSelection}
									onFetchCandidates={handleFetchCandidates}
									expanded={expandedRows}
									onExpandedChange={setExpandedRows}
								/>

								{/* Load more button */}
								{hasNextPage && (
									<div className="mt-6 flex justify-center">
										<Button variant="secondary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
											{isFetchingNextPage && <Loader2 className="size-4 animate-spin mr-2" />}
											Load more
										</Button>
									</div>
								)}
							</>
						)}
					</div>
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
