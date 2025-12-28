import type React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './features/auth';
import { queryClient } from './lib/query-client';

export function AppProvider({ children }: { children: React.ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>{children}</AuthProvider>
		</QueryClientProvider>
	);
}
