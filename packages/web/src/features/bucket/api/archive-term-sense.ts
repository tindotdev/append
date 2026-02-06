import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateTermAndBuckets } from './query-invalidation';
import { postJsonWithVersion } from './request';

// Response types
export interface ArchiveTermSenseResponse {
	sense: {
		id: string;
		termId: string;
		version: number;
		archivedAt: number;
	};
	term?: {
		id: string;
		primarySenseId: string | null;
		version: number;
		archivedAt: number | null;
	};
	noop?: boolean;
}

export interface RestoreTermSenseResponse {
	sense: {
		id: string;
		termId: string;
		version: number;
		archivedAt: null;
	};
	term?: {
		id: string;
		primarySenseId: string | null;
		version: number;
		archivedAt: null;
	};
	noop?: boolean;
}

interface ArchiveTermSenseRequest {
	expectedVersion: number;
}

/**
 * Archive a term sense (soft delete).
 */
export async function archiveTermSense(senseId: string, request: ArchiveTermSenseRequest): Promise<ArchiveTermSenseResponse> {
	return postJsonWithVersion<ArchiveTermSenseResponse, ArchiveTermSenseRequest>(`/api/term-sense/${senseId}/archive`, request);
}

/**
 * Restore an archived term sense.
 */
export async function restoreTermSense(senseId: string, request: ArchiveTermSenseRequest): Promise<RestoreTermSenseResponse> {
	return postJsonWithVersion<RestoreTermSenseResponse, ArchiveTermSenseRequest>(`/api/term-sense/${senseId}/restore`, request);
}

/**
 * React Query mutation hook for archiving a term sense.
 */
export function useArchiveTermSense() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ senseId, expectedVersion }: { senseId: string; expectedVersion: number }) =>
			archiveTermSense(senseId, { expectedVersion }),
		onSuccess: (result) => {
			invalidateTermAndBuckets(queryClient, result.sense.termId);
		},
	});
}

/**
 * React Query mutation hook for restoring a term sense.
 */
export function useRestoreTermSense() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ senseId, expectedVersion }: { senseId: string; expectedVersion: number }) =>
			restoreTermSense(senseId, { expectedVersion }),
		onSuccess: (result) => {
			invalidateTermAndBuckets(queryClient, result.sense.termId);
		},
	});
}
