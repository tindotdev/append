import { createFileRoute } from '@tanstack/react-router';
import { TryShell } from '@/components/layouts/TryShell';

export const Route = createFileRoute('/try')({
	component: TryShell,
});
