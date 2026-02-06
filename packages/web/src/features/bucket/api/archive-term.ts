import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateTermAndBuckets } from './query-invalidation';
import { postJsonWithVersion } from './request';

// Response types
export interface ArchiveTermResponse {
	term: {
		id: string;
		version: number;
		archivedAt: number;
	};
	noop?: boolean;
}

export interface RestoreTermResponse {
	term: {
		id: string;
		version: number;
		archivedAt: null;
	};
	noop?: boolean;
}

interface ArchiveTermRequest {
	expectedVersion: number;
}

/**
 * Archive a term (soft delete).
 */
export async function archiveTerm(termId: string, request: ArchiveTermRequest): Promise<ArchiveTermResponse> {
	return postJsonWithVersion<ArchiveTermResponse, ArchiveTermRequest>(`/api/term/${termId}/archive`, request);
}

/**
 * Restore an archived term.
 */
export async function restoreTerm(termId: string, request: ArchiveTermRequest): Promise<RestoreTermResponse> {
	return postJsonWithVersion<RestoreTermResponse, ArchiveTermRequest>(`/api/term/${termId}/restore`, request);
}

/**
 * React Query mutation hook for archiving a term.
 */
export function useArchiveTerm() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ termId, expectedVersion }: { termId: string; expectedVersion: number }) => archiveTerm(termId, { expectedVersion }),
		onSuccess: (_, { termId }) => {
			invalidateTermAndBuckets(queryClient, termId);
		},
	});
}

/**
 * React Query mutation hook for restoring a term.
 */
export function useRestoreTerm() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ termId, expectedVersion }: { termId: string; expectedVersion: number }) => restoreTerm(termId, { expectedVersion }),
		onSuccess: (_, { termId }) => {
			invalidateTermAndBuckets(queryClient, termId);
		},
	});
}
