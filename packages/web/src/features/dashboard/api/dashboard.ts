/**
 * Dashboard API client using Hono RPC.
 *
 * Production: always use API
 * Dev: localStorage flag `append.dashboard.useApi` to toggle (default: false in dev)
 */

import { useQuery } from '@tanstack/react-query';
import { api, parseRpcJson } from '../../../lib/api-rpc';
import { getBrowserTimezone } from '../telemetry/time';
import type { HeatmapData, HeatmapStatsData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEV_MODE = import.meta.env.DEV;
const LOCAL_STORAGE_KEY = 'append.dashboard.useApi';

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
 */
export function setUseApi(enabled: boolean): void {
	try {
		if (enabled) {
			localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
		} else {
			localStorage.removeItem(LOCAL_STORAGE_KEY);
		}
	} catch {
		// Ignore storage errors
	}
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
 * Only enabled when shouldUseApi() returns true.
 */
export function useDashboardToday(timezone?: string) {
	const tz = timezone ?? getBrowserTimezone();
	const enabled = shouldUseApi();

	return useQuery({
		queryKey: dashboardKeys.today(tz),
		queryFn: () => fetchDashboardToday(tz),
		enabled,
		staleTime: 30_000, // 30 seconds
		refetchOnWindowFocus: true,
	});
}

/**
 * Hook to fetch weekly dashboard data.
 * Only enabled when shouldUseApi() returns true.
 */
export function useDashboardWeek(start: string, timezone?: string) {
	const tz = timezone ?? getBrowserTimezone();
	const enabled = shouldUseApi();

	return useQuery({
		queryKey: dashboardKeys.week(start, tz),
		queryFn: () => fetchDashboardWeek(start, tz),
		enabled,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	});
}

/**
 * Hook to fetch heatmap data.
 * Only enabled when shouldUseApi() returns true.
 */
export function useDashboardHeatmap(year: number, timezone?: string) {
	const tz = timezone ?? getBrowserTimezone();
	const enabled = shouldUseApi();

	return useQuery({
		queryKey: dashboardKeys.heatmap(year, tz),
		queryFn: () => fetchDashboardHeatmap(year, tz),
		enabled,
		staleTime: 60_000, // 1 minute (heatmap changes less frequently)
		refetchOnWindowFocus: true,
	});
}
