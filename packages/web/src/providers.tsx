import type React from 'react';
import { AuthProvider } from './components/AuthProvider';

export function AppProvider({ children }: { children: React.ReactNode }) {
	return <AuthProvider>{children}</AuthProvider>;
}
