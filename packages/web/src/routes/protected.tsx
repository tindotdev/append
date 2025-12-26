import { createRoute, redirect, type AnyRoute } from "@tanstack/react-router";

import { ProtectedLayout } from "../components/ProtectedLayout";
import { BatchNewPage } from "../pages/BatchNewPage";
import { BatchDetailPage } from "../pages/BatchDetailPage";
import { BucketFeedPage } from "../pages/BucketFeedPage";
import { ExportPage } from "../pages/ExportPage";

export function createProtectedRoutes(rootRoute: AnyRoute) {
  const protectedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "protected",
    beforeLoad: ({ context }) => {
      if (!context.auth.isPending && !context.auth.data) {
        throw redirect({ to: "/sign-in" });
      }
    },
    component: ProtectedLayout,
  });

  const indexRoute = createRoute({
    getParentRoute: () => protectedRoute,
    path: "/",
    beforeLoad: () => {
      throw redirect({ to: "/batch/new" });
    },
  });

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

  const bucketFeedRoute = createRoute({
    getParentRoute: () => protectedRoute,
    path: "/bucket/$slug",
    component: BucketFeedPage,
  });

  const exportRoute = createRoute({
    getParentRoute: () => protectedRoute,
    path: "/export",
    component: ExportPage,
  });

  protectedRoute.addChildren([
    indexRoute,
    batchNewRoute,
    batchDetailRoute,
    bucketFeedRoute,
    exportRoute,
  ]);

  return { protectedRoute };
}
