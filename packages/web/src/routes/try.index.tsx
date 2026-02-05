import { createFileRoute } from '@tanstack/react-router';
import { TryCapturePage } from '@/features/try';

export const Route = createFileRoute('/try/')({
	component: TryCapturePage,
});
