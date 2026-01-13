import type React from 'react';
import { createContext, useContext } from 'react';

export type DashboardDataMode = 'auto' | 'api' | 'local';

const DashboardDataModeContext = createContext<DashboardDataMode>('auto');

export function DashboardDataModeProvider({ children, mode }: { children: React.ReactNode; mode: DashboardDataMode }) {
	return <DashboardDataModeContext.Provider value={mode}>{children}</DashboardDataModeContext.Provider>;
}

export function useDashboardDataMode(): DashboardDataMode {
	return useContext(DashboardDataModeContext);
}
