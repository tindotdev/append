import { createFileRoute } from '@tanstack/react-router';
import { BatchDetailPage } from '@/features/batch';

export const Route = createFileRoute('/_protected/batch/$batchId')({
	component: BatchDetailPage,
});
