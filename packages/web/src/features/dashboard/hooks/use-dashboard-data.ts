import { useMemo } from 'react';
import { useApiToggle, useDashboardToday, useDashboardWeek } from '../api/dashboard';
import { useTelemetrySnapshot } from '../telemetry/hooks';
import { computeDashboardData } from '../telemetry/rollups';
import { addDays, getTodayKey } from '../telemetry/time';
import type {
	StreakData,
	TodayBreakdownData,
	TodayCapturesData,
	TodayHeroData,
	TopSourceData,
	TopTopicData,
	WeekBarChartData,
} from '../types';

interface UseDashboardDataOptions {
	forceEmpty?: boolean;
	forceLoading?: boolean;
}

let lastRevision: number | null = null;
let lastTimezone: string | null = null;
let lastComputed: ReturnType<typeof computeDashboardData> | null = null;

function getComputed(revision: number, events: Parameters<typeof computeDashboardData>[0], timezone: string) {
	if (lastComputed && lastRevision === revision && lastTimezone === timezone) return lastComputed;
	lastRevision = revision;
	lastTimezone = timezone;
	lastComputed = computeDashboardData(events, timezone);
	return lastComputed;
}

// Empty state defaults
const EMPTY_TODAY_HERO: TodayHeroData = { todayMinutes: 0, sevenDayAvgMinutes: 0 };
const EMPTY_BREAKDOWN: TodayBreakdownData = { topics: [], sources: [] };
const EMPTY_WEEK_DATA: WeekBarChartData = { days: [] };
const EMPTY_CAPTURES: TodayCapturesData = { count: 0, items: [] };
const EMPTY_STREAK: StreakData = { currentStreak: 0, minMinutesThreshold: 10 };
const EMPTY_TOP_SOURCE: TopSourceData = { source: '', minutes: 0 };
const EMPTY_TOP_TOPIC: TopTopicData = { topic: '', minutes: 0, weeklyTotalMinutes: 0 };

export function useTodayHeroData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = useApiToggle();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TodayHeroData>(() => {
		if (forceLoading) return EMPTY_TODAY_HERO;
		if (forceEmpty) return EMPTY_TODAY_HERO;

		// In API mode, only use API data (never fall back to simulator)
		if (useApi) {
			return apiQuery.data ? apiQuery.data.todayHero : EMPTY_TODAY_HERO;
		}

		// Not in API mode, use local computation
		if (!isReady) return EMPTY_TODAY_HERO;
		return getComputed(revision, events, timezone).todayHero;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.todayMinutes === 0 };
}

export function useTodayBreakdownData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = useApiToggle();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TodayBreakdownData>(() => {
		if (forceLoading) return EMPTY_BREAKDOWN;
		if (forceEmpty) return EMPTY_BREAKDOWN;

		// In API mode, only use API data (never fall back to simulator)
		if (useApi) {
			return apiQuery.data ? apiQuery.data.todayBreakdown : EMPTY_BREAKDOWN;
		}

		// Not in API mode, use local computation
		if (!isReady) return EMPTY_BREAKDOWN;
		return getComputed(revision, events, timezone).todayBreakdown;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.topics.length === 0 };
}

export function useWeekBarChartData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = useApiToggle();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const weekStart = addDays(getTodayKey(timezone), -6);
	const apiQuery = useDashboardWeek(weekStart, timezone);

	const data = useMemo<WeekBarChartData>(() => {
		if (forceLoading) return EMPTY_WEEK_DATA;
		if (forceEmpty) return EMPTY_WEEK_DATA;

		// In API mode, only use API data (never fall back to simulator)
		if (useApi) {
			return apiQuery.data ? apiQuery.data.week : EMPTY_WEEK_DATA;
		}

		// Not in API mode, use local computation
		if (!isReady) return EMPTY_WEEK_DATA;
		return getComputed(revision, events, timezone).week;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.days.length === 0 };
}

export function useTodayCapturesData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = useApiToggle();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TodayCapturesData>(() => {
		if (forceLoading) return EMPTY_CAPTURES;
		if (forceEmpty) return EMPTY_CAPTURES;

		// In API mode, only use API data (never fall back to simulator)
		if (useApi) {
			return apiQuery.data ? apiQuery.data.todayCaptures : EMPTY_CAPTURES;
		}

		// Not in API mode, use local computation
		if (!isReady) return EMPTY_CAPTURES;
		return getComputed(revision, events, timezone).captures;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.count === 0 };
}

export function useStreakData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = useApiToggle();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<StreakData>(() => {
		if (forceLoading) return EMPTY_STREAK;
		if (forceEmpty) return EMPTY_STREAK;

		// In API mode, only use API data (never fall back to simulator)
		if (useApi) {
			return apiQuery.data ? apiQuery.data.streak : EMPTY_STREAK;
		}

		// Not in API mode, use local computation
		if (!isReady) return EMPTY_STREAK;
		return getComputed(revision, events, timezone).streak;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.currentStreak === 0 };
}

export function useTopSourceData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = useApiToggle();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TopSourceData>(() => {
		if (forceLoading) return EMPTY_TOP_SOURCE;
		if (forceEmpty) return EMPTY_TOP_SOURCE;

		// In API mode, only use API data (never fall back to simulator)
		if (useApi) {
			return apiQuery.data ? apiQuery.data.topSource : EMPTY_TOP_SOURCE;
		}

		// Not in API mode, use local computation
		if (!isReady) return EMPTY_TOP_SOURCE;
		return getComputed(revision, events, timezone).topSource;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || !data.source };
}

export function useTopTopicData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = useApiToggle();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TopTopicData>(() => {
		if (forceLoading) return EMPTY_TOP_TOPIC;
		if (forceEmpty) return EMPTY_TOP_TOPIC;

		// In API mode, only use API data (never fall back to simulator)
		if (useApi) {
			return apiQuery.data ? apiQuery.data.topTopic : EMPTY_TOP_TOPIC;
		}

		// Not in API mode, use local computation
		if (!isReady) return EMPTY_TOP_TOPIC;
		return getComputed(revision, events, timezone).topTopic;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || !data.topic };
}
