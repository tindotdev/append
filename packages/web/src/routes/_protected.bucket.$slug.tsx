import { createFileRoute } from '@tanstack/react-router';
import { BucketFeedPage } from '@/features/bucket';

export const Route = createFileRoute('/_protected/bucket/$slug')({
	validateSearch: (search: Record<string, unknown>) => ({
		term: typeof search.term === 'string' ? search.term : undefined,
	}),
	component: BucketFeedPage,
});
