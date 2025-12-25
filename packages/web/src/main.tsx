import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import "./main.css";
import { useSession } from "./lib/auth";
import { ProtectedLayout } from "./components/ProtectedLayout";
import { SignInPage } from "./pages/SignInPage";
import { BatchNewPage } from "./pages/BatchNewPage";
import { BatchDetailPage } from "./pages/BatchDetailPage";
import { BucketFeedPage } from "./pages/BucketFeedPage";

// Router context type
interface RouterContext {
  auth: {
    isAuthenticated: boolean;
    user: { id: string; email: string; name: string } | null;
    isPending: boolean;
  };
}

// Root route with context
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});

// Public: Sign-in route
// Note: beforeLoad handles navigation-time redirects; SignInPage handles
// reactive redirects when auth state changes after mount
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  beforeLoad: ({ context }) => {
    if (!context.auth.isPending && context.auth.isAuthenticated) {
      throw redirect({ to: "/batch/new" });
    }
  },
  component: SignInPage,
});

// Protected layout route (pathless) with beforeLoad auth check
// Note: beforeLoad handles navigation-time redirects; ProtectedLayout handles
// reactive redirects when auth state changes after mount
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  beforeLoad: ({ context }) => {
    if (!context.auth.isPending && !context.auth.isAuthenticated) {
      throw redirect({ to: "/sign-in" });
    }
  },
  component: ProtectedLayout,
});

// Index route - redirects to /batch/new
const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/batch/new" });
  },
});

// Batch routes (protected)
const batchNewRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/batch/new",
  component: BatchNewPage,
});

const batchDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/batch/$batchId",
  component: BatchDetailPage,
});

// Bucket feed route (protected)
const bucketFeedRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/bucket/$slug",
  component: BucketFeedPage,
});

// Build route tree
const routeTree = rootRoute.addChildren([
  signInRoute,
  protectedRoute.addChildren([indexRoute, batchNewRoute, batchDetailRoute, bucketFeedRoute]),
]);

const router = createRouter({
  routeTree,
  context: {
    auth: {
      isAuthenticated: false,
      user: null,
      isPending: true,
    },
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Inner app that provides auth context to router
function InnerApp() {
  const { data: session, isPending } = useSession();

  return (
    <RouterProvider
      router={router}
      context={{
        auth: {
          isAuthenticated: !!session,
          user: session?.user ?? null,
          isPending,
        },
      }}
    />
  );
}

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <InnerApp />
    </StrictMode>,
  );
}
