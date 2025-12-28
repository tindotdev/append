import type React from 'react';
import { useSession } from '../api/auth-client';
import { AuthContext } from '../hooks/use-auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const session = useSession();

	return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
