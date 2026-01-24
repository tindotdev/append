import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignInPage } from '@/features/auth';

export const Route = createFileRoute('/sign-in')({
	beforeLoad: ({ context }) => {
		if (!context.auth.isPending && context.auth.data) {
			throw redirect({ to: '/batch/new' });
		}
	},
	component: SignInPage,
});
