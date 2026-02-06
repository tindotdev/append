import type { QueryClient } from '@tanstack/react-query';
import { bucketKeys } from './get-bucket-feed';
import { termKeys } from './get-term';

/**
 * Invalidate term detail and all bucket feeds after term/sense mutations.
 * Used by archive/restore operations to ensure UI reflects latest state.
 */
export function invalidateTermAndBuckets(queryClient: QueryClient, termId: string): void {
	queryClient.invalidateQueries({ queryKey: termKeys.detail(termId) });
	queryClient.invalidateQueries({ queryKey: bucketKeys.all });
}
