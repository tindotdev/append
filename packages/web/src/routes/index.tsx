import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { createProtectedRoutes } from "./protected";
import { createPublicRoutes } from "./public";
import { AuthContextType } from "@/providers";

export interface RouterContext {
  auth: AuthContextType
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
