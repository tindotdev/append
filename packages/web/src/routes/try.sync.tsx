import { createFileRoute } from '@tanstack/react-router';
import { TrySyncPage } from '@/features/try';

export const Route = createFileRoute('/try/sync')({
	component: TrySyncPage,
});
