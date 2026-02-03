import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/handle-api-error';
import { acceptBatch } from '../api/accept-batch';
import { bulkAcceptBatches } from '../api/bulk-accept';
import { bulkDeleteBatches } from '../api/bulk-delete';
import { deleteBatch } from '../api/delete-batch';
import { batchKeys } from '../api/get-batch';
import type { BatchListItem } from '../types';

export function useBatchActions(queryClient: QueryClient, trackBatch: (batchId: string) => Promise<void>) {
	const [acceptingBatches, setAcceptingBatches] = useState<Set<string>>(new Set());
	const [retryingBatches, setRetryingBatches] = useState<Set<string>>(new Set());
	const [deletingBatches, setDeletingBatches] = useState<Set<string>>(new Set());
	const [batchToDelete, setBatchToDelete] = useState<BatchListItem | null>(null);

	// Use refs for guard state to avoid unnecessary callback recreation
	const acceptingBatchesRef = useRef<Set<string>>(new Set());
	const retryingBatchesRef = useRef<Set<string>>(new Set());
	const deletingBatchesRef = useRef<Set<string>>(new Set());

	// Bulk operations state
	const [isBulkAccepting, setIsBulkAccepting] = useState(false);
	const [isBulkRetrying, setIsBulkRetrying] = useState(false);
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

	const handleAcceptAllReady = useCallback(
		async (batch: BatchListItem) => {
			if (acceptingBatchesRef.current.has(batch.id)) return;

			acceptingBatchesRef.current.add(batch.id);
			setAcceptingBatches((prev) => new Set(prev).add(batch.id));

			try {
				const summary = await acceptBatch(batch.id);
				toast.success(`Accepted ${summary.acceptedCount} terms (${summary.termCreatedCount} new terms created)`);
				await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
			} catch (err) {
				handleApiError(err, {
					onConflict: (_code, details) => {
						const reason = details?.reason as string | undefined;
						if (reason === 'SUGGESTIONS_IN_PROGRESS') {
							toast.error('Cannot accept: some suggestions are still being generated.');
						} else if (reason === 'MISSING_EFFECTIVE_FIELDS') {
							toast.error('Cannot accept: some candidates are missing bucket or text.');
						} else {
							toast.error('Cannot accept: please refresh and try again.');
						}
					},
					onDefault: () => toast.error('Accept failed. Please try again.'),
				});
			} finally {
				acceptingBatchesRef.current.delete(batch.id);
				setAcceptingBatches((prev) => {
					const next = new Set(prev);
					next.delete(batch.id);
					return next;
				});
			}
		},
		[queryClient]
	);

	const handleRetry = useCallback(
		async (batch: BatchListItem) => {
			if (retryingBatchesRef.current.has(batch.id)) return;

			retryingBatchesRef.current.add(batch.id);
			setRetryingBatches((prev) => new Set(prev).add(batch.id));

			try {
				await trackBatch(batch.id);
			} catch {
				// Error handling is done in the hook
			} finally {
				retryingBatchesRef.current.delete(batch.id);
				setRetryingBatches((prev) => {
					const next = new Set(prev);
					next.delete(batch.id);
					return next;
				});
			}
		},
		[trackBatch]
	);

	const handleDelete = useCallback((batch: BatchListItem) => {
		setBatchToDelete(batch);
	}, []);

	const handleConfirmDelete = useCallback(async () => {
		if (!batchToDelete) return;
		if (deletingBatchesRef.current.has(batchToDelete.id)) return;

		const batch = batchToDelete;
		setBatchToDelete(null);
		deletingBatchesRef.current.add(batch.id);
		setDeletingBatches((prev) => new Set(prev).add(batch.id));

		try {
			await deleteBatch(batch.id);
			toast.success(`Deleted batch with ${batch.candidateCount} terms`);
			await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
		} catch (err) {
			handleApiError(err, {
				onNotFound: async () => {
					toast.error('Batch not found. It may have already been deleted.');
					await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
				},
				onDefault: () => toast.error('Failed to delete batch. Please try again.'),
			});
		} finally {
			deletingBatchesRef.current.delete(batch.id);
			setDeletingBatches((prev) => {
				const next = new Set(prev);
				next.delete(batch.id);
				return next;
			});
		}
	}, [batchToDelete, queryClient]);

	const handleBulkAcceptAllReady = useCallback(
		async (selectedBatchIds: string[]) => {
			if (selectedBatchIds.length === 0 || isBulkAccepting) return;

			setIsBulkAccepting(true);

			try {
				const summary = await bulkAcceptBatches(selectedBatchIds);

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

				await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
				return true; // signal to clear selection
			} catch {
				toast.error('Failed to accept batches. Please try again.');
				return false;
			} finally {
				setIsBulkAccepting(false);
			}
		},
		[isBulkAccepting, queryClient]
	);

	const handleBulkRetry = useCallback(
		async (selectedBatchIds: string[]) => {
			if (selectedBatchIds.length === 0 || isBulkRetrying) return;

			setIsBulkRetrying(true);

			let successCount = 0;
			let failedCount = 0;

			for (const batchId of selectedBatchIds) {
				try {
					await trackBatch(batchId);
					successCount++;
				} catch {
					failedCount++;
				}
			}

			if (failedCount > 0 && successCount > 0) {
				toast.warning(`Completed ${successCount} batches, ${failedCount} failed`);
			} else if (failedCount > 0) {
				toast.error('Failed to retry all batches. Please try again.');
			}

			setIsBulkRetrying(false);

			// Only clear selection if at least some batches succeeded
			return failedCount !== selectedBatchIds.length;
		},
		[isBulkRetrying, trackBatch]
	);

	const handleBulkDeleteRequest = useCallback((selectedBatchIds: string[]) => {
		if (selectedBatchIds.length === 0) return;
		setShowBulkDeleteConfirm(true);
	}, []);

	const handleBulkDeleteConfirm = useCallback(
		async (selectedBatchIds: string[]) => {
			if (selectedBatchIds.length === 0 || isBulkDeleting) return;

			setShowBulkDeleteConfirm(false);
			setIsBulkDeleting(true);

			try {
				const summary = await bulkDeleteBatches(selectedBatchIds);

				if (summary.failureCount === 0) {
					toast.success(`Deleted ${summary.successCount} batches`);
				} else if (summary.successCount === 0) {
					toast.error('Failed to delete all batches. Please try again.');
				} else {
					toast.warning(`Deleted ${summary.successCount} batches, ${summary.failureCount} failed`);
				}

				await queryClient.invalidateQueries({ queryKey: batchKeys.lists() });
				return true; // signal to clear selection
			} catch {
				toast.error('Failed to delete batches. Please try again.');
				return false;
			} finally {
				setIsBulkDeleting(false);
			}
		},
		[isBulkDeleting, queryClient]
	);

	return {
		acceptingBatches,
		retryingBatches,
		deletingBatches,
		batchToDelete,
		setBatchToDelete,
		isBulkAccepting,
		isBulkRetrying,
		isBulkDeleting,
		showBulkDeleteConfirm,
		setShowBulkDeleteConfirm,
		handleAcceptAllReady,
		handleRetry,
		handleDelete,
		handleConfirmDelete,
		handleBulkAcceptAllReady,
		handleBulkRetry,
		handleBulkDeleteRequest,
		handleBulkDeleteConfirm,
	};
}
