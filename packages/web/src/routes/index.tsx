import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { AuthContextType } from '@/providers';
import { createProtectedRoutes } from './protected';
import { createPublicRoutes } from './public';

export interface RouterContext {
	auth: AuthContextType;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<>
			<Outlet />
			<TanStackRouterDevtools />
		</>
	),
});

const { signInRoute } = createPublicRoutes(rootRoute);
const { protectedRoute } = createProtectedRoutes(rootRoute);

export const routeTree = rootRoute.addChildren([signInRoute, protectedRoute]);
