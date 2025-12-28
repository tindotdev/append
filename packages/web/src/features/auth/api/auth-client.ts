import { createAuthClient } from 'better-auth/react';
import { API_URL } from '@/lib/api-client';

export const authClient = createAuthClient({
	baseURL: API_URL,
	basePath: '/auth',
});

export const { signIn, signOut, useSession } = authClient;
