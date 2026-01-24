import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { AuthContextType } from '@/features/auth/hooks/use-auth';

export interface RouterContext {
	auth: AuthContextType;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<>
			<Outlet />
			{import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
		</>
	),
});
