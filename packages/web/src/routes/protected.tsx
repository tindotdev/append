import { type AnyRoute, createRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '@/components/layouts/AppShell';
import { BatchDetailPage, BatchListPage, BatchNewPage, SearchPage } from '@/features/batch';
import { BucketFeedPage } from '@/features/bucket';
import { ExportPage } from '@/features/export';
import { ImportPage } from '@/features/import';
import { SettingsPage } from '@/features/settings';

export function createProtectedRoutes<TParentRoute extends AnyRoute>(rootRoute: TParentRoute) {
	const protectedRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: 'protected',
		beforeLoad: ({ context }) => {
			if (!context.auth.isPending && !context.auth.data) {
				throw redirect({ to: '/sign-in' });
			}
		},
		component: AppShell,
	});

	const indexRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/',
		beforeLoad: () => {
			throw redirect({ to: '/batch/new' });
		},
	});

	const batchListRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/batch',
		component: BatchListPage,
	});

	const batchNewRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/batch/new',
		component: BatchNewPage,
	});

	const batchDetailRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/batch/$batchId',
		component: BatchDetailPage,
	});

	const bucketFeedRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/bucket/$slug',
		component: BucketFeedPage,
	});

	const exportRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/export',
		component: ExportPage,
	});

	const importRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/import',
		component: ImportPage,
	});

	const searchRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/search',
		component: SearchPage,
	});

	const settingsRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/settings',
		component: SettingsPage,
	});

	const protectedRouteWithChildren = protectedRoute.addChildren([
		indexRoute,
		batchListRoute,
		batchNewRoute,
		batchDetailRoute,
		bucketFeedRoute,
		exportRoute,
		importRoute,
		searchRoute,
		settingsRoute,
	]);

	return { protectedRoute: protectedRouteWithChildren };
}
