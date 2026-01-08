import { useMemo } from 'react';
import { useTelemetrySnapshot } from '../telemetry/hooks';
import { computeDashboardData } from '../telemetry/rollups';
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
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();

	const data = useMemo<TodayHeroData>(() => {
		if (forceLoading || !isReady || forceEmpty) return EMPTY_TODAY_HERO;
		return getComputed(revision, events, timezone).todayHero;
	}, [events, forceEmpty, forceLoading, isReady, revision, timezone]);

	return { data, isLoading: forceLoading || !isReady, isEmpty: forceEmpty || data.todayMinutes === 0 };
}

export function useTodayBreakdownData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();

	const data = useMemo<TodayBreakdownData>(() => {
		if (forceLoading || !isReady || forceEmpty) return EMPTY_BREAKDOWN;
		return getComputed(revision, events, timezone).todayBreakdown;
	}, [events, forceEmpty, forceLoading, isReady, revision, timezone]);

	return { data, isLoading: forceLoading || !isReady, isEmpty: forceEmpty || data.topics.length === 0 };
}

export function useWeekBarChartData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();

	const data = useMemo<WeekBarChartData>(() => {
		if (forceLoading || !isReady || forceEmpty) return EMPTY_WEEK_DATA;
		return getComputed(revision, events, timezone).week;
	}, [events, forceEmpty, forceLoading, isReady, revision, timezone]);

	return { data, isLoading: forceLoading || !isReady, isEmpty: forceEmpty || data.days.length === 0 };
}

export function useTodayCapturesData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();

	const data = useMemo<TodayCapturesData>(() => {
		if (forceLoading || !isReady || forceEmpty) return EMPTY_CAPTURES;
		return getComputed(revision, events, timezone).captures;
	}, [events, forceEmpty, forceLoading, isReady, revision, timezone]);

	return { data, isLoading: forceLoading || !isReady, isEmpty: forceEmpty || data.count === 0 };
}

export function useStreakData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();

	const data = useMemo<StreakData>(() => {
		if (forceLoading || !isReady || forceEmpty) return EMPTY_STREAK;
		return getComputed(revision, events, timezone).streak;
	}, [events, forceEmpty, forceLoading, isReady, revision, timezone]);

	return { data, isLoading: forceLoading || !isReady, isEmpty: forceEmpty || data.currentStreak === 0 };
}

export function useTopSourceData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();

	const data = useMemo<TopSourceData>(() => {
		if (forceLoading || !isReady || forceEmpty) return EMPTY_TOP_SOURCE;
		return getComputed(revision, events, timezone).topSource;
	}, [events, forceEmpty, forceLoading, isReady, revision, timezone]);

	return { data, isLoading: forceLoading || !isReady, isEmpty: forceEmpty || !data.source };
}

export function useTopTopicData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;
	const { isReady, events, timezone, revision } = useTelemetrySnapshot();

	const data = useMemo<TopTopicData>(() => {
		if (forceLoading || !isReady || forceEmpty) return EMPTY_TOP_TOPIC;
		return getComputed(revision, events, timezone).topTopic;
	}, [events, forceEmpty, forceLoading, isReady, revision, timezone]);

	return { data, isLoading: forceLoading || !isReady, isEmpty: forceEmpty || !data.topic };
}
