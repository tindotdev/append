import { createFileRoute } from '@tanstack/react-router';
import { DemoDashboardPage } from '@/components/demo/DemoDashboardPage';

export const Route = createFileRoute('/_demo/demo')({
	component: DemoDashboardPage,
});
