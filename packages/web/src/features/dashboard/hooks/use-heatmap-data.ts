import { useMemo } from 'react';
import { shouldUseApi, useDashboardHeatmap } from '../api/dashboard';
import { useTelemetrySnapshot } from '../telemetry/hooks';
import { computeHeatmapData } from '../telemetry/rollups';
import type { HeatmapData, HeatmapStatsData } from '../types';

interface UseHeatmapDataOptions {
	/** Force empty state for testing */
	forceEmpty?: boolean;
	/** Force loading state for testing */
	forceLoading?: boolean;
}

const EMPTY_DATA: HeatmapData = {
	year: new Date().getFullYear(),
	timezone: 'UTC',
	days: [],
};

const EMPTY_STATS: HeatmapStatsData = {
	totalMinutes: 0,
	avgPerDay: 0,
	activeDays: 0,
};

let lastRevision: number | null = null;
let lastTimezone: string | null = null;
let lastYear: number | null = null;
let lastComputed: { data: HeatmapData; stats: HeatmapStatsData } | null = null;

function yearInTimezone(timezone: string, now = new Date()): number {
	const y = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric' }).format(now);
	return Number(y);
}

function getComputed(revision: number, events: Parameters<typeof computeHeatmapData>[0], timezone: string, year: number) {
	if (lastComputed && lastRevision === revision && lastTimezone === timezone && lastYear === year) return lastComputed;
	lastRevision = revision;
	lastTimezone = timezone;
	lastYear = year;
	lastComputed = computeHeatmapData(events, timezone, year);
	return lastComputed;
}

export function useHeatmapData(options: UseHeatmapDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const year = yearInTimezone(timezone);
	const apiQuery = useDashboardHeatmap(year, timezone);

	const computed = useMemo(() => {
		if (forceLoading) {
			return { data: EMPTY_DATA, stats: EMPTY_STATS };
		}
		if (forceEmpty) {
			return { data: { ...EMPTY_DATA, timezone, year }, stats: EMPTY_STATS };
		}

		// Use API data if enabled and available
		if (useApi && apiQuery.data) {
			return { data: apiQuery.data.data, stats: apiQuery.data.stats };
		}

		// Fall back to local computation
		if (!isReady) {
			return { data: EMPTY_DATA, stats: EMPTY_STATS };
		}
		return getComputed(revision, events, timezone, year);
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi, year]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data: computed.data, stats: computed.stats, isLoading };
}
