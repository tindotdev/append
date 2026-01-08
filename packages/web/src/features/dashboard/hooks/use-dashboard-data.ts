import { useMemo } from 'react';
import type {
	BreakdownItem,
	CaptureItem,
	StreakData,
	TodayBreakdownData,
	TodayCapturesData,
	TodayHeroData,
	TopSourceData,
	TopTopicData,
	WeekBarChartData,
	WeekDayData,
} from '../types';

interface UseDashboardDataOptions {
	forceEmpty?: boolean;
	forceLoading?: boolean;
}

// Mock topic data
const MOCK_TOPICS: BreakdownItem[] = [
	{ id: '1', label: 'TypeScript', minutes: 42 },
	{ id: '2', label: 'React Patterns', minutes: 28 },
	{ id: '3', label: 'System Design', minutes: 15 },
	{ id: '4', label: 'PostgreSQL', minutes: 10 },
	{ id: '5', label: 'GraphQL', minutes: 8 },
	{ id: '6', label: 'Testing', minutes: 5 },
];

// Mock source data
const MOCK_SOURCES: BreakdownItem[] = [
	{ id: '1', label: 'docs.cloudflare.com', minutes: 35 },
	{ id: '2', label: 'react.dev', minutes: 28 },
	{ id: '3', label: 'orm.drizzle.team', minutes: 22 },
	{ id: '4', label: 'typescriptlang.org', minutes: 12 },
	{ id: '5', label: 'postgresql.org', minutes: 8 },
];

// Mock capture items
const MOCK_CAPTURES: CaptureItem[] = [
	{ id: '1', type: 'term', label: 'idempotency key', source: 'orm.drizzle.team' },
	{ id: '2', type: 'question', label: 'SQLite vs Postgres for edge?', source: 'docs.cloudflare.com' },
	{ id: '3', type: 'note', label: 'React Server Components caching', source: 'react.dev' },
	{ id: '4', type: 'snippet', label: 'Drizzle migration setup', source: 'orm.drizzle.team' },
	{ id: '5', type: 'term', label: 'connection pooling', source: 'postgresql.org' },
];

function generateWeekData(): WeekDayData[] {
	const days: WeekDayData[] = [];
	const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const today = new Date('2026-01-08'); // Thursday

	for (let i = 6; i >= 0; i--) {
		const date = new Date(today);
		date.setDate(today.getDate() - i);
		const dayIndex = (date.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0

		days.push({
			date: date.toISOString().split('T')[0],
			dayLabel: dayLabels[dayIndex],
			minutes: Math.random() > 0.2 ? Math.floor(Math.random() * 120) + 15 : 0,
		});
	}

	return days;
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

	const data = useMemo<TodayHeroData>(() => {
		if (forceLoading || forceEmpty) return EMPTY_TODAY_HERO;
		return {
			todayMinutes: 95,
			sevenDayAvgMinutes: 73,
		};
	}, [forceEmpty, forceLoading]);

	return { data, isLoading: forceLoading, isEmpty: forceEmpty || data.todayMinutes === 0 };
}

export function useTodayBreakdownData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;

	const data = useMemo<TodayBreakdownData>(() => {
		if (forceLoading || forceEmpty) return EMPTY_BREAKDOWN;
		return {
			topics: MOCK_TOPICS,
			sources: MOCK_SOURCES,
		};
	}, [forceEmpty, forceLoading]);

	return { data, isLoading: forceLoading, isEmpty: forceEmpty || data.topics.length === 0 };
}

export function useWeekBarChartData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;

	const data = useMemo<WeekBarChartData>(() => {
		if (forceLoading || forceEmpty) return EMPTY_WEEK_DATA;
		return { days: generateWeekData() };
	}, [forceEmpty, forceLoading]);

	return { data, isLoading: forceLoading, isEmpty: forceEmpty || data.days.length === 0 };
}

export function useTodayCapturesData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;

	const data = useMemo<TodayCapturesData>(() => {
		if (forceLoading || forceEmpty) return EMPTY_CAPTURES;
		return {
			count: 6,
			items: MOCK_CAPTURES,
		};
	}, [forceEmpty, forceLoading]);

	return { data, isLoading: forceLoading, isEmpty: forceEmpty || data.count === 0 };
}

export function useStreakData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;

	const data = useMemo<StreakData>(() => {
		if (forceLoading || forceEmpty) return EMPTY_STREAK;
		return {
			currentStreak: 4,
			minMinutesThreshold: 10,
		};
	}, [forceEmpty, forceLoading]);

	return { data, isLoading: forceLoading, isEmpty: forceEmpty || data.currentStreak === 0 };
}

export function useTopSourceData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;

	const data = useMemo<TopSourceData>(() => {
		if (forceLoading || forceEmpty) return EMPTY_TOP_SOURCE;
		return {
			source: 'docs.cloudflare.com',
			minutes: 320,
		};
	}, [forceEmpty, forceLoading]);

	return { data, isLoading: forceLoading, isEmpty: forceEmpty || !data.source };
}

export function useTopTopicData(options: UseDashboardDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;

	const data = useMemo<TopTopicData>(() => {
		if (forceLoading || forceEmpty) return EMPTY_TOP_TOPIC;
		return {
			topic: 'Backend',
			minutes: 192, // 3h 12m
			weeklyTotalMinutes: 457, // ~42% of this
		};
	}, [forceEmpty, forceLoading]);

	return { data, isLoading: forceLoading, isEmpty: forceEmpty || !data.topic };
}
