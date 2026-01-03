import { QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { AuthProvider } from './features/auth';
import { OutboxProvider } from './features/outbox';
import { queryClient } from './lib/query-client';

export function AppProvider({ children }: { children: React.ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<AuthProvider>
					<OutboxProvider>
						{children}
						<Toaster />
					</OutboxProvider>
				</AuthProvider>
			</TooltipProvider>
		</QueryClientProvider>
	);
}
