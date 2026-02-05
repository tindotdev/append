import { createFileRoute } from '@tanstack/react-router';
import { TryBucketPage } from '@/features/try';

export const Route = createFileRoute('/try/bucket/$slug')({
	validateSearch: (search: Record<string, unknown>) => ({
		term: typeof search.term === 'string' ? search.term : undefined,
	}),
	component: TryBucketPage,
});
