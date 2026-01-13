import { type AnyRoute, createRoute, redirect } from '@tanstack/react-router';
import { GuestShell } from '@/components/layouts/GuestShell';
import { SignInPage } from '@/features/auth';
import type { AuthContextType } from '@/features/auth/hooks/use-auth';
import { DemoDashboardPage } from '@/routes/demo/DemoDashboardPage';

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

	const demoRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: 'demo',
		component: GuestShell,
	});

	const demoDashboardRoute = createRoute({
		getParentRoute: () => demoRoute,
		path: '/demo',
		component: DemoDashboardPage,
	});

	return { signInRoute, demoRoute: demoRoute.addChildren([demoDashboardRoute]) };
}
