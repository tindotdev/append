import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bucketKeys } from './get-bucket-feed';
import { termKeys } from './get-term';
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
			// Invalidate the specific term and all bucket feeds
			queryClient.invalidateQueries({ queryKey: termKeys.detail(termId) });
			queryClient.invalidateQueries({ queryKey: bucketKeys.all });
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
			// Invalidate the specific term and all bucket feeds
			queryClient.invalidateQueries({ queryKey: termKeys.detail(termId) });
			queryClient.invalidateQueries({ queryKey: bucketKeys.all });
		},
	});
}
