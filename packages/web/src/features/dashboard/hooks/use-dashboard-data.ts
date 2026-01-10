import { useMemo } from 'react';
import { shouldUseApi, useDashboardToday, useDashboardWeek } from '../api/dashboard';
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
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TodayHeroData>(() => {
		if (forceLoading) return EMPTY_TODAY_HERO;
		if (forceEmpty) return EMPTY_TODAY_HERO;

		// Use API data if enabled and available
		if (useApi && apiQuery.data) {
			return apiQuery.data.todayHero;
		}

		// Fall back to local computation
		if (!isReady) return EMPTY_TODAY_HERO;
		return getComputed(revision, events, timezone).todayHero;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.todayMinutes === 0 };
}

export function useTodayBreakdownData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TodayBreakdownData>(() => {
		if (forceLoading) return EMPTY_BREAKDOWN;
		if (forceEmpty) return EMPTY_BREAKDOWN;

		if (useApi && apiQuery.data) {
			return apiQuery.data.todayBreakdown;
		}

		if (!isReady) return EMPTY_BREAKDOWN;
		return getComputed(revision, events, timezone).todayBreakdown;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.topics.length === 0 };
}

export function useWeekBarChartData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const weekStart = addDays(getTodayKey(timezone), -6);
	const apiQuery = useDashboardWeek(weekStart, timezone);

	const data = useMemo<WeekBarChartData>(() => {
		if (forceLoading) return EMPTY_WEEK_DATA;
		if (forceEmpty) return EMPTY_WEEK_DATA;

		if (useApi && apiQuery.data) {
			return apiQuery.data.week;
		}

		if (!isReady) return EMPTY_WEEK_DATA;
		return getComputed(revision, events, timezone).week;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.days.length === 0 };
}

export function useTodayCapturesData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TodayCapturesData>(() => {
		if (forceLoading) return EMPTY_CAPTURES;
		if (forceEmpty) return EMPTY_CAPTURES;

		if (useApi && apiQuery.data) {
			return apiQuery.data.todayCaptures;
		}

		if (!isReady) return EMPTY_CAPTURES;
		return getComputed(revision, events, timezone).captures;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.count === 0 };
}

export function useStreakData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<StreakData>(() => {
		if (forceLoading) return EMPTY_STREAK;
		if (forceEmpty) return EMPTY_STREAK;

		if (useApi && apiQuery.data) {
			return apiQuery.data.streak;
		}

		if (!isReady) return EMPTY_STREAK;
		return getComputed(revision, events, timezone).streak;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || data.currentStreak === 0 };
}

export function useTopSourceData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TopSourceData>(() => {
		if (forceLoading) return EMPTY_TOP_SOURCE;
		if (forceEmpty) return EMPTY_TOP_SOURCE;

		if (useApi && apiQuery.data) {
			return apiQuery.data.topSource;
		}

		if (!isReady) return EMPTY_TOP_SOURCE;
		return getComputed(revision, events, timezone).topSource;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || !data.source };
}

export function useTopTopicData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const useApi = shouldUseApi();
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();
	const apiQuery = useDashboardToday(timezone);

	const data = useMemo<TopTopicData>(() => {
		if (forceLoading) return EMPTY_TOP_TOPIC;
		if (forceEmpty) return EMPTY_TOP_TOPIC;

		if (useApi && apiQuery.data) {
			return apiQuery.data.topTopic;
		}

		if (!isReady) return EMPTY_TOP_TOPIC;
		return getComputed(revision, events, timezone).topTopic;
	}, [apiQuery.data, events, forceEmpty, forceLoading, isReady, revision, timezone, useApi]);

	const isLoading = forceLoading || (useApi ? apiQuery.isLoading : !isReady);
	return { data, isLoading, isEmpty: forceEmpty || !data.topic };
}
