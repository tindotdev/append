import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/layouts/AppShell';

export const Route = createFileRoute('/_protected')({
	beforeLoad: ({ context }) => {
		if (!context.auth.isPending && !context.auth.data) {
			throw redirect({ to: '/sign-in' });
		}
	},
	component: AppShell,
});
