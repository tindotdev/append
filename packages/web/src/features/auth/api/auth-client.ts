import { createAuthClient } from 'better-auth/react';
import { API_URL } from '@/lib/api-rpc';

export const authClient = createAuthClient({
	baseURL: API_URL,
	basePath: '/auth',
	// Include credentials for cross-origin requests (preview environments)
	fetchOptions: {
		credentials: 'include',
	},
});

export const { signIn, signOut, useSession } = authClient;
