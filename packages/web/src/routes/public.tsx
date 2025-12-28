import { type AnyRoute, createRoute, redirect } from '@tanstack/react-router';
import { SignInPage } from '@/features/auth';
import type { AuthContextType } from '@/features/auth/hooks/use-auth';

export function createPublicRoutes<TParentRoute extends AnyRoute>(rootRoute: TParentRoute) {
	const signInRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/sign-in',
		beforeLoad: ({ context }) => {
			const { auth } = context as { auth: AuthContextType };
			if (!auth.isPending && auth.data) {
				throw redirect({ to: '/batch/new' });
			}
		},
		component: SignInPage,
	});

	return { signInRoute };
}
