import { createAuthClient } from 'better-auth/react';

// API URL - local dev or production
const API_URL = import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.append.tindev.dev';

export const authClient = createAuthClient({
	baseURL: API_URL,
	basePath: '/auth',
});

export const { signIn, signOut, useSession } = authClient;
