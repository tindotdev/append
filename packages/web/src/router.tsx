import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routes';

export const router = createRouter({
	routeTree,
	context: {
		auth: undefined as any, // Set after wrapping in AuthProvider
	},
	defaultPreload: 'intent',
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
