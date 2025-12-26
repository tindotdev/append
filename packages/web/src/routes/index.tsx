import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { AuthContextType } from '@/components/AuthProvider';
import { createProtectedRoutes } from './protected';
import { createPublicRoutes } from './public';

export interface RouterContext {
	auth: AuthContextType;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<>
			<Outlet />
			{import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
		</>
	),
});

const { signInRoute } = createPublicRoutes(rootRoute);
const { protectedRoute } = createProtectedRoutes(rootRoute);

export const routeTree = rootRoute.addChildren([signInRoute, protectedRoute]);
