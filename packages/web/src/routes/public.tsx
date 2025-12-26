import { createRoute, redirect, type AnyRoute } from "@tanstack/react-router";
import type { AuthContextType } from "@/providers";

import { SignInPage } from "../pages/SignInPage";

interface RouterContext {
  auth: AuthContextType;
}

export function createPublicRoutes(rootRoute: AnyRoute) {
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    beforeLoad: ({ context }: { context: RouterContext }) => {
      if (!context.auth.isPending && context.auth.data) {
        throw redirect({ to: "/batch/new" as "/" });
      }
    },
    component: SignInPage,
  });

  return { signInRoute };
}
