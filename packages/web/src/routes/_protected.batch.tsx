import { createFileRoute } from '@tanstack/react-router';
import { BatchListPage } from '@/features/batch';

export const Route = createFileRoute('/_protected/batch')({
	component: BatchListPage,
});
