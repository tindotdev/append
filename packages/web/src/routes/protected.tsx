import { type AnyRoute, createRoute, redirect } from '@tanstack/react-router';

import { ProtectedLayout } from '../components/ProtectedLayout';
import { BatchDetailPage } from '../pages/BatchDetailPage';
import { BatchListPage } from '../pages/BatchListPage';
import { BatchNewPage } from '../pages/BatchNewPage';
import { BucketFeedPage } from '../pages/BucketFeedPage';
import { ExportPage } from '../pages/ExportPage';
import { SearchPage } from '../pages/SearchPage';

export function createProtectedRoutes<TParentRoute extends AnyRoute>(rootRoute: TParentRoute) {
	const protectedRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: 'protected',
		beforeLoad: ({ context }) => {
			if (!context.auth.isPending && !context.auth.data) {
				throw redirect({ to: '/sign-in' });
			}
		},
		component: ProtectedLayout,
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

	const searchRoute = createRoute({
		getParentRoute: () => protectedRoute,
		path: '/search',
		component: SearchPage,
	});

	const protectedRouteWithChildren = protectedRoute.addChildren([
		indexRoute,
		batchListRoute,
		batchNewRoute,
		batchDetailRoute,
		bucketFeedRoute,
		exportRoute,
		searchRoute,
	]);

	return { protectedRoute: protectedRouteWithChildren };
}
