import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/layouts/AppShell';

export const Route = createFileRoute('/_protected')({
	beforeLoad: ({ context }) => {
		// Redirect unauthenticated users to sign-in once auth state resolves.
		// When isPending is true, we pass through to allow AppShell to render
		// a loading fallback, preventing premature child route execution.
		if (!context.auth.isPending && !context.auth.data) {
			throw redirect({ to: '/sign-in' });
		}
	},
	component: AppShell,
});
