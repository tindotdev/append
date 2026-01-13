/**
 * Dashboard rollup types (API-side mirror of web types).
 */

export type TopicSlug = 'foundations' | 'backend' | 'frontend' | 'dx-tooling' | 'deep-concepts';

export interface Artifact {
	url_hash: string;
	host: string;
	path_hint?: string;
	title_hint?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event types (from DB rows)
// ─────────────────────────────────────────────────────────────────────────────

export interface DbEventRow {
	userId: string;
	deviceId: string;
	eventId: string;
	schemaVersion: number;
	type: string;
	emittedAt: Date;
	receivedAt: Date;
	artifactHost: string | null;
	artifactUrlHash: string | null;
	artifactPathHint: string | null;
	titleHint: string | null;
	payloadJson: string;
}

export interface ActiveSignals {
	window_focused: boolean;
	tab_active: boolean;
	user_idle: boolean;
}

export interface ArtifactActivePayload {
	interval_ms: number;
	active_signals: ActiveSignals;
}

export interface CapturePayload {
	capture_type: 'term' | 'question';
	label: string;
	note?: string;
}

export interface TopicOverridePayload {
	topic_slug: TopicSlug;
	scope: 'artifact' | 'capture' | 'time_range';
	starts_at?: number;
	ends_at?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rollup output types (credit index)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditIndex {
	totalMsByDay: Map<string, number>;
	msByDayAndHost: Map<string, number>;
	msByDayAndTopic: Map<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response types (mirror web/src/features/dashboard/types)
// ─────────────────────────────────────────────────────────────────────────────

export interface TodayHeroData {
	todayMinutes: number;
	sevenDayAvgMinutes: number;
}

export interface BreakdownItem {
	id: string;
	label: string;
	minutes: number;
}

export interface TodayBreakdownData {
	topics: BreakdownItem[];
	sources: BreakdownItem[];
}

export interface WeekDayData {
	date: string;
	dayLabel: string;
	minutes: number;
}

export interface WeekBarChartData {
	days: WeekDayData[];
}

export type CaptureType = 'term' | 'question';

export interface CaptureItem {
	id: string;
	type: CaptureType;
	label: string;
	source: string;
}

export interface TodayCapturesData {
	count: number;
	items: CaptureItem[];
}

export interface StreakData {
	currentStreak: number;
	minMinutesThreshold: number;
}

export interface TopSourceData {
	source: string;
	minutes: number;
}

export interface TopTopicData {
	topic: string;
	minutes: number;
	weeklyTotalMinutes: number;
}

export interface HeatmapDay {
	date: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// API response shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardTodayResponse {
	todayHero: TodayHeroData;
	streak: StreakData;
	todayBreakdown: TodayBreakdownData;
	topSource: TopSourceData;
	topTopic: TopTopicData;
	todayCaptures: TodayCapturesData;
}

export interface DashboardWeekResponse {
	week: WeekBarChartData;
	weekBreakdown: TodayBreakdownData;
}

export interface DashboardHeatmapResponse {
	data: HeatmapData;
	stats: HeatmapStatsData;
}
