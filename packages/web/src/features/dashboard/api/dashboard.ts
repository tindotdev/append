/**
 * Dashboard API client using Hono RPC.
 *
 * Production: always use API
 * Dev: localStorage flag `append.dashboard.useApi` to toggle (default: false in dev)
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { api, parseRpcJson } from '../../../lib/api-rpc';
import { useDashboardDataMode } from '../context/dashboard-data-mode';
import { getBrowserTimezone } from '../telemetry/time';
import type { HeatmapData, HeatmapStatsData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEV_MODE = import.meta.env.DEV;
const LOCAL_STORAGE_KEY = 'append.dashboard.useApi';

// Subscribers for localStorage changes
const subscribers = new Set<() => void>();

/**
 * Check if we should use API for dashboard data.
 * - Production: always true
 * - Dev: check localStorage flag (defaults to false)
 */
export function shouldUseApi(): boolean {
	if (!DEV_MODE) return true;
	try {
		return localStorage.getItem(LOCAL_STORAGE_KEY) === 'true';
	} catch {
		return false;
	}
}

/**
 * Set whether to use API for dashboard data in dev mode.
 * Notifies all subscribers of the change.
 */
export function setUseApi(enabled: boolean): void {
	try {
		if (enabled) {
			localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
		} else {
			localStorage.removeItem(LOCAL_STORAGE_KEY);
		}
		// Notify all subscribers
		for (const callback of subscribers) {
			callback();
		}
	} catch {
		// Ignore storage errors
	}
}

/**
 * React hook to subscribe to API toggle state.
 * Returns true in production or when API mode is enabled in dev.
 * Automatically re-renders when the toggle changes.
 */
export function useApiToggle(): boolean {
	const mode = useDashboardDataMode();
	const auto = useSyncExternalStore(
		(callback) => {
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		shouldUseApi,
		() => true // Server-side always returns true
	);

	if (mode === 'api') return true;
	if (mode === 'local') return false;
	return auto;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types (matching API contract)
// ─────────────────────────────────────────────────────────────────────────────

interface BreakdownItem {
	id: string;
	label: string;
	minutes: number;
}

interface CaptureItem {
	id: string;
	type: 'term' | 'question';
	label: string;
	source: string;
}

export interface DashboardTodayApiResponse {
	todayHero: { todayMinutes: number; sevenDayAvgMinutes: number };
	streak: { currentStreak: number; minMinutesThreshold: number };
	todayBreakdown: { topics: BreakdownItem[]; sources: BreakdownItem[] };
	topSource: { source: string; minutes: number };
	topTopic: { topic: string; minutes: number; weeklyTotalMinutes: number };
	todayCaptures: { count: number; items: CaptureItem[] };
}

interface WeekDayData {
	date: string;
	dayLabel: string;
	minutes: number;
}

export interface DashboardWeekApiResponse {
	week: { days: WeekDayData[] };
	weekBreakdown: { topics: BreakdownItem[]; sources: BreakdownItem[] };
}

export interface DashboardHeatmapApiResponse {
	data: HeatmapData;
	stats: HeatmapStatsData;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Fetch Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch today's dashboard data from the API.
 */
export async function fetchDashboardToday(timezone?: string): Promise<DashboardTodayApiResponse> {
	const tz = timezone ?? getBrowserTimezone();
	const res = await api.api.dashboard.today.$get({ query: { tz } });
	return parseRpcJson<DashboardTodayApiResponse>(res);
}

/**
 * Fetch weekly dashboard data from the API.
 */
export async function fetchDashboardWeek(start: string, timezone?: string): Promise<DashboardWeekApiResponse> {
	const tz = timezone ?? getBrowserTimezone();
	const res = await api.api.dashboard.week.$get({ query: { start, tz } });
	return parseRpcJson<DashboardWeekApiResponse>(res);
}

/**
 * Fetch heatmap data from the API.
 */
export async function fetchDashboardHeatmap(year: number, timezone?: string): Promise<DashboardHeatmapApiResponse> {
	const tz = timezone ?? getBrowserTimezone();
	const res = await api.api.dashboard.heatmap.$get({ query: { year: String(year), tz } });
	return parseRpcJson<DashboardHeatmapApiResponse>(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// React Query Hooks
// ─────────────────────────────────────────────────────────────────────────────

export const dashboardKeys = {
	all: ['dashboard'] as const,
	today: (tz: string) => [...dashboardKeys.all, 'today', tz] as const,
	week: (start: string, tz: string) => [...dashboardKeys.all, 'week', start, tz] as const,
	heatmap: (year: number, tz: string) => [...dashboardKeys.all, 'heatmap', year, tz] as const,
};

/**
 * Hook to fetch today's dashboard data.
 * Only enabled when API mode is active.
 */
export function useDashboardToday(timezone?: string) {
	const tz = timezone ?? getBrowserTimezone();
	const enabled = useApiToggle();

	const query = useQuery({
		queryKey: dashboardKeys.today(tz),
		queryFn: () => fetchDashboardToday(tz),
		enabled,
		staleTime: 30_000, // 30 seconds
		refetchOnWindowFocus: true,
	});

	// Show toast on error (only when error state changes)
	useEffect(() => {
		if (query.error) {
			console.error("[Dashboard] Failed to load today's data:", query.error);
			toast.error('Failed to load dashboard. Please try again.', { id: 'dashboard-today-error' });
		}
	}, [query.error]);

	return query;
}

/**
 * Hook to fetch weekly dashboard data.
 * Only enabled when API mode is active.
 */
export function useDashboardWeek(start: string, timezone?: string) {
	const tz = timezone ?? getBrowserTimezone();
	const enabled = useApiToggle();

	const query = useQuery({
		queryKey: dashboardKeys.week(start, tz),
		queryFn: () => fetchDashboardWeek(start, tz),
		enabled,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	});

	// Show toast on error (only when error state changes)
	useEffect(() => {
		if (query.error) {
			console.error('[Dashboard] Failed to load weekly data:', query.error);
			toast.error('Failed to load weekly dashboard. Please try again.', { id: 'dashboard-week-error' });
		}
	}, [query.error]);

	return query;
}

/**
 * Hook to fetch heatmap data.
 * Only enabled when API mode is active.
 */
export function useDashboardHeatmap(year: number, timezone?: string) {
	const tz = timezone ?? getBrowserTimezone();
	const enabled = useApiToggle();

	const query = useQuery({
		queryKey: dashboardKeys.heatmap(year, tz),
		queryFn: () => fetchDashboardHeatmap(year, tz),
		enabled,
		staleTime: 60_000, // 1 minute (heatmap changes less frequently)
		refetchOnWindowFocus: true,
	});

	// Show toast on error (only when error state changes)
	useEffect(() => {
		if (query.error) {
			console.error('[Dashboard] Failed to load heatmap data:', query.error);
			toast.error('Failed to load heatmap. Please try again.', { id: 'dashboard-heatmap-error' });
		}
	}, [query.error]);

	return query;
}
