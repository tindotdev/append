import React from 'react';
import { useSession } from '../api/auth-client';

export type AuthContextType = ReturnType<typeof useSession>;

export const AuthContext = React.createContext<AuthContextType | null>(null);

export function useAuth() {
	const context = React.useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
}
