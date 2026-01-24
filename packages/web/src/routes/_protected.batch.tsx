import { createFileRoute } from '@tanstack/react-router';
import { BatchNewPage } from '@/features/batch';

export const Route = createFileRoute('/_protected/batch')({
	component: BatchNewPage,
});
