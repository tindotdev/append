import { type AnyRoute, createRoute, redirect } from '@tanstack/react-router';
import type { AuthContextType } from '@/components/AuthProvider';

import { SignInPage } from '../pages/SignInPage';

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
