import type {
	BreakdownItem,
	CaptureItem,
	HeatmapData,
	HeatmapStatsData,
	StreakData,
	TodayBreakdownData,
	TodayCapturesData,
	TodayHeroData,
	TopSourceData,
	TopTopicData,
	WeekBarChartData,
} from '../types';
import { addDays, daysInYear, formatDayKey, getTodayKey, weekdayLabel } from './time';
import type { TelemetryEvent, TopicSlug } from './types';

const MIN_ACTIVE_MINUTES_FOR_STREAK = 10;
const IDLE_CUTOFF_MS = 300_000;

const TOPIC_LABELS: Record<TopicSlug, string> = {
	foundations: 'Foundations',
	backend: 'Backend',
	frontend: 'Frontend',
	'dx-tooling': 'DX Tooling',
	'deep-concepts': 'Deep Concepts',
};

function topicDefaultForHost(host: string): TopicSlug {
	if (host.endsWith('react.dev') || host.endsWith('developer.mozilla.org')) return 'frontend';
	if (host.includes('typescriptlang') || host.includes('vite') || host.includes('cloudflare')) return 'dx-tooling';
	if (host.includes('postgresql') || host.includes('drizzle') || host.includes('orm')) return 'backend';
	if (host.includes('wikipedia')) return 'foundations';
	return 'deep-concepts';
}

type TopicOverride = { topic: TopicSlug; starts_at?: number; ends_at?: number };

function buildTopicOverrideIndex(events: TelemetryEvent[]): Map<string, TopicOverride[]> {
	const byArtifact = new Map<string, TopicOverride[]>();
	for (const e of events) {
		if (e.type !== 'topic_override') continue;
		if (!e.artifact) continue;
		const key = `${e.artifact.host}:${e.artifact.url_hash}`;
		const list = byArtifact.get(key) ?? [];
		list.push({ topic: e.payload.topic_slug, starts_at: e.payload.starts_at, ends_at: e.payload.ends_at });
		byArtifact.set(key, list);
	}
	return byArtifact;
}

function resolveTopicForArtifact(opts: {
	host: string;
	artifactKey: string;
	emitted_at: number;
	overridesByArtifact: Map<string, TopicOverride[]>;
}): TopicSlug {
	const { host, artifactKey, emitted_at, overridesByArtifact } = opts;
	const overrides = overridesByArtifact.get(artifactKey) ?? [];

	// Precedence: override > heuristic(default host mapping)
	for (const o of overrides) {
		const startsOk = o.starts_at == null || emitted_at >= o.starts_at;
		const endsOk = o.ends_at == null || emitted_at <= o.ends_at;
		if (startsOk && endsOk) return o.topic;
	}
	return topicDefaultForHost(host);
}

function isHeartbeatActive(active_signals: { user_idle: boolean; window_focused: boolean; tab_active: boolean }) {
	return !active_signals.user_idle && active_signals.window_focused && active_signals.tab_active;
}

function computeHeartbeatCreditMs(opts: {
	emitted_at: number;
	prev_emitted_at?: number;
	interval_ms: number;
	active_signals: { user_idle: boolean; window_focused: boolean; tab_active: boolean };
}): number {
	if (!isHeartbeatActive(opts.active_signals)) return 0;
	if (opts.prev_emitted_at == null) return opts.interval_ms;
	const gap = opts.emitted_at - opts.prev_emitted_at;
	if (gap <= IDLE_CUTOFF_MS) return Math.min(gap, opts.interval_ms);
	return opts.interval_ms;
}

export function computeCreditIndex(events: TelemetryEvent[], timezone: string) {
	const overridesByArtifact = buildTopicOverrideIndex(events);

	const heartbeats = events
		.filter((e): e is Extract<TelemetryEvent, { type: 'artifact_active' }> => e.type === 'artifact_active')
		.filter((e) => !!e.artifact)
		.slice()
		.sort((a, b) => a.emitted_at - b.emitted_at);

	const lastEmittedAtByArtifact = new Map<string, number>();

	const totalMsByDay = new Map<string, number>();
	const msByDayAndHost = new Map<string, number>();
	const msByDayAndTopic = new Map<string, number>();

	for (const hb of heartbeats) {
		const artifactKey = `${hb.artifact.host}:${hb.artifact.url_hash}`;
		const prevEmittedAt = lastEmittedAtByArtifact.get(artifactKey);
		const creditMs = computeHeartbeatCreditMs({
			emitted_at: hb.emitted_at,
			prev_emitted_at: prevEmittedAt,
			interval_ms: hb.payload.interval_ms,
			active_signals: hb.payload.active_signals,
		});
		lastEmittedAtByArtifact.set(artifactKey, hb.emitted_at);

		if (creditMs <= 0) continue;
		const dayKey = formatDayKey(hb.emitted_at, timezone);
		totalMsByDay.set(dayKey, (totalMsByDay.get(dayKey) ?? 0) + creditMs);

		const hostKey = `${dayKey}|${hb.artifact.host}`;
		msByDayAndHost.set(hostKey, (msByDayAndHost.get(hostKey) ?? 0) + creditMs);

		const topic = resolveTopicForArtifact({
			host: hb.artifact.host,
			artifactKey,
			emitted_at: hb.emitted_at,
			overridesByArtifact,
		});
		const topicKey = `${dayKey}|${topic}`;
		msByDayAndTopic.set(topicKey, (msByDayAndTopic.get(topicKey) ?? 0) + creditMs);
	}

	return { totalMsByDay, msByDayAndHost, msByDayAndTopic };
}

function msToMinutes(ms: number) {
	return Math.round(ms / 60_000);
}

function topNBreakdown(
	map: Map<string, number>,
	filterPrefix: string,
	makeItem: (key: string, minutes: number) => BreakdownItem
): BreakdownItem[] {
	const items: Array<{ key: string; minutes: number }> = [];
	for (const [k, v] of map) {
		if (!k.startsWith(filterPrefix)) continue;
		items.push({ key: k, minutes: msToMinutes(v) });
	}
	items.sort((a, b) => b.minutes - a.minutes);
	return items.filter((i) => i.minutes > 0).map((i) => makeItem(i.key, i.minutes));
}

export function computeTodayHeroDataFromIndex(index: ReturnType<typeof computeCreditIndex>, timezone: string): TodayHeroData {
	const { totalMsByDay } = index;
	const todayKey = getTodayKey(timezone);
	const todayMinutes = msToMinutes(totalMsByDay.get(todayKey) ?? 0);

	const dayKeys: string[] = [];
	for (let i = 0; i < 7; i += 1) dayKeys.push(addDays(todayKey, -i));
	const sevenDayTotal = dayKeys.reduce((sum, k) => sum + msToMinutes(totalMsByDay.get(k) ?? 0), 0);
	const sevenDayAvgMinutes = Math.round(sevenDayTotal / 7);

	return { todayMinutes, sevenDayAvgMinutes };
}

export function computeTodayBreakdownDataFromIndex(index: ReturnType<typeof computeCreditIndex>, timezone: string): TodayBreakdownData {
	const { msByDayAndHost, msByDayAndTopic } = index;
	const todayKey = getTodayKey(timezone);

	const topics = topNBreakdown(msByDayAndTopic, `${todayKey}|`, (key, minutes) => {
		const topic = key.split('|')[1] as TopicSlug;
		return { id: topic, label: TOPIC_LABELS[topic] ?? topic, minutes };
	});

	const sources = topNBreakdown(msByDayAndHost, `${todayKey}|`, (key, minutes) => {
		const host = key.split('|')[1];
		return { id: host, label: host, minutes };
	});

	return { topics, sources };
}

export function computeWeekBarChartDataFromIndex(index: ReturnType<typeof computeCreditIndex>, timezone: string): WeekBarChartData {
	const { totalMsByDay } = index;
	const todayKey = getTodayKey(timezone);

	const days = [];
	for (let i = 6; i >= 0; i -= 1) {
		const dayKey = addDays(todayKey, -i);
		days.push({
			date: dayKey,
			dayLabel: weekdayLabel(dayKey, timezone),
			minutes: msToMinutes(totalMsByDay.get(dayKey) ?? 0),
		});
	}

	return { days };
}

export function computeTodayCapturesData(events: TelemetryEvent[], timezone: string): TodayCapturesData {
	const todayKey = getTodayKey(timezone);
	const captures: Array<CaptureItem & { emitted_at: number }> = [];

	for (const e of events) {
		if (e.type !== 'capture') continue;
		const dayKey = formatDayKey(e.emitted_at, timezone);
		if (dayKey !== todayKey) continue;
		captures.push({
			id: e.event_id,
			type: e.payload.capture_type,
			label: e.payload.label,
			source: e.artifact?.host ?? 'unknown',
			emitted_at: e.emitted_at,
		});
	}

	captures.sort((a, b) => b.emitted_at - a.emitted_at);
	return { count: captures.length, items: captures.map(({ emitted_at: _emittedAt, ...rest }) => rest) };
}

export function computeStreakDataFromIndex(index: ReturnType<typeof computeCreditIndex>, timezone: string): StreakData {
	const { totalMsByDay } = index;
	const todayKey = getTodayKey(timezone);

	let streak = 0;
	for (let i = 0; i < 365; i += 1) {
		const dayKey = addDays(todayKey, -i);
		const minutes = msToMinutes(totalMsByDay.get(dayKey) ?? 0);
		if (minutes >= MIN_ACTIVE_MINUTES_FOR_STREAK) streak += 1;
		else break;
	}

	return { currentStreak: streak, minMinutesThreshold: MIN_ACTIVE_MINUTES_FOR_STREAK };
}

export function computeTopSourceDataFromIndex(index: ReturnType<typeof computeCreditIndex>, timezone: string): TopSourceData {
	const { msByDayAndHost } = index;
	const todayKey = getTodayKey(timezone);

	const weekKeys: string[] = [];
	for (let i = 0; i < 7; i += 1) weekKeys.push(addDays(todayKey, -i));

	const totalsByHost = new Map<string, number>();
	for (const dayKey of weekKeys) {
		for (const [k, v] of msByDayAndHost) {
			if (!k.startsWith(`${dayKey}|`)) continue;
			const host = k.split('|')[1];
			totalsByHost.set(host, (totalsByHost.get(host) ?? 0) + v);
		}
	}

	let best: { host: string; ms: number } | null = null;
	for (const [host, ms] of totalsByHost) {
		if (!best || ms > best.ms) best = { host, ms };
	}

	return best ? { source: best.host, minutes: msToMinutes(best.ms) } : { source: '', minutes: 0 };
}

export function computeTopTopicDataFromIndex(index: ReturnType<typeof computeCreditIndex>, timezone: string): TopTopicData {
	const { msByDayAndTopic } = index;
	const todayKey = getTodayKey(timezone);

	const weekKeys: string[] = [];
	for (let i = 0; i < 7; i += 1) weekKeys.push(addDays(todayKey, -i));

	const totalsByTopic = new Map<TopicSlug, number>();
	for (const dayKey of weekKeys) {
		for (const [k, v] of msByDayAndTopic) {
			if (!k.startsWith(`${dayKey}|`)) continue;
			const topic = k.split('|')[1] as TopicSlug;
			totalsByTopic.set(topic, (totalsByTopic.get(topic) ?? 0) + v);
		}
	}

	let best: { topic: TopicSlug; ms: number } | null = null;
	let totalMs = 0;
	for (const [topic, ms] of totalsByTopic) {
		totalMs += ms;
		if (!best || ms > best.ms) best = { topic, ms };
	}

	return best
		? { topic: TOPIC_LABELS[best.topic] ?? best.topic, minutes: msToMinutes(best.ms), weeklyTotalMinutes: msToMinutes(totalMs) }
		: { topic: '', minutes: 0, weeklyTotalMinutes: 0 };
}

export function computeHeatmapData(
	events: TelemetryEvent[],
	timezone: string,
	year: number
): { data: HeatmapData; stats: HeatmapStatsData } {
	const { totalMsByDay } = computeCreditIndex(events, timezone);

	const days: HeatmapData['days'] = [];
	const count = daysInYear(year);

	let totalMinutes = 0;
	let activeDays = 0;

	for (let i = 0; i < count; i += 1) {
		const ms = Date.UTC(year, 0, 1 + i, 12, 0, 0);
		const dayKey = formatDayKey(ms, timezone);
		const minutes = msToMinutes(totalMsByDay.get(dayKey) ?? 0);
		days.push({ date: dayKey, minutes });
		if (minutes > 0) {
			activeDays += 1;
			totalMinutes += minutes;
		}
	}

	const avgPerDay = activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0;

	return {
		data: { year, timezone, days },
		stats: { totalMinutes, avgPerDay, activeDays },
	};
}

export function computeDashboardData(events: TelemetryEvent[], timezone: string) {
	const index = computeCreditIndex(events, timezone);
	return {
		todayHero: computeTodayHeroDataFromIndex(index, timezone),
		todayBreakdown: computeTodayBreakdownDataFromIndex(index, timezone),
		week: computeWeekBarChartDataFromIndex(index, timezone),
		captures: computeTodayCapturesData(events, timezone),
		streak: computeStreakDataFromIndex(index, timezone),
		topSource: computeTopSourceDataFromIndex(index, timezone),
		topTopic: computeTopTopicDataFromIndex(index, timezone),
	};
}
