export interface HeatmapDay {
	date: string; // ISO format: "2026-01-01"
	minutes: number;
}

export interface HeatmapData {
	year: number;
	timezone: string;
	days: HeatmapDay[];
}

export interface HeatmapStatsData {
	totalMinutes: number;
	avgPerDay: number;
	activeDays: number;
}

// Today Hero Card
export interface TodayHeroData {
	todayMinutes: number;
	sevenDayAvgMinutes: number;
}

// Today Breakdown (Topic/Source)
export interface BreakdownItem {
	id: string;
	label: string;
	minutes: number;
}

export interface TodayBreakdownData {
	topics: BreakdownItem[];
	sources: BreakdownItem[];
}

// Week Bar Chart
export interface WeekDayData {
	date: string; // ISO format: "2026-01-01"
	dayLabel: string; // "Mon", "Tue", etc.
	minutes: number;
}

export interface WeekBarChartData {
	days: WeekDayData[];
}

// Today Captures
export type CaptureType = 'term' | 'question' | 'note' | 'snippet';

export interface CaptureItem {
	id: string;
	type: CaptureType;
	label: string;
	source: string; // domain or source name
}

export interface TodayCapturesData {
	count: number;
	items: CaptureItem[];
}

// Streak
export interface StreakData {
	currentStreak: number;
	minMinutesThreshold: number; // e.g., 10 minutes
}

// Top Source
export interface TopSourceData {
	source: string;
	minutes: number;
}

// Top Topic (weekly)
export interface TopTopicData {
	topic: string;
	minutes: number;
	weeklyTotalMinutes: number; // for calculating percentage
}
