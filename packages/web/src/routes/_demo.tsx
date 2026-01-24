import { createFileRoute } from '@tanstack/react-router';
import { GuestShell } from '@/components/layouts/GuestShell';

export const Route = createFileRoute('/_demo')({
	component: GuestShell,
});
