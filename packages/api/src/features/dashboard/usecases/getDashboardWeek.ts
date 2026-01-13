/**
 * GET /api/dashboard/week usecase.
 *
 * Returns:
 * - week: { days: [{ date, dayLabel, minutes }] } - 7-day series
 * - weekBreakdown: { topics, sources } - aggregated for the week
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../../../db';
import { fetchAllOverrides, fetchEventsPaged, MAX_EVENTS_PER_REQUEST, mergeWithOverrides } from '../data/event-fetcher';
import { computeCreditIndex, IDLE_CUTOFF_MS, msToMinutes } from '../rollups/credit';
import { addDays, parseDayKeyToTzRange, weekdayLabel } from '../rollups/time';
import { TOPIC_LABELS } from '../rollups/topics';
import type { BreakdownItem, DashboardWeekResponse, DbEventRow, TopicSlug } from '../rollups/types';

/**
 * Build breakdown items from credit index across all days.
 */
function buildWeekBreakdown(
	map: Map<string, number>,
	dayKeys: string[],
	makeItem: (key: string, minutes: number) => BreakdownItem
): BreakdownItem[] {
	const totals = new Map<string, number>();

	for (const dayKey of dayKeys) {
		const prefix = `${dayKey}|`;
		for (const [k, v] of map) {
			if (!k.startsWith(prefix)) continue;
			const subKey = k.split('|')[1];
			totals.set(subKey, (totals.get(subKey) ?? 0) + v);
		}
	}

	const items: Array<{ key: string; minutes: number }> = [];
	for (const [k, v] of totals) {
		items.push({ key: k, minutes: msToMinutes(v) });
	}

	items.sort((a, b) => b.minutes - a.minutes);
	return items.filter((i) => i.minutes > 0).map((i) => makeItem(i.key, i.minutes));
}

export async function getDashboardWeek(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	startDayKey: string,
	timezone: string
): Promise<{ ok: true; data: DashboardWeekResponse } | { ok: false; error: 'RANGE_TOO_LARGE' }> {
	// Week is start + 6 days (7 days total)
	const endDayKey = addDays(startDayKey, 6);

	const { startMs: weekStartMs } = parseDayKeyToTzRange(startDayKey, timezone);
	const { endMs: weekEndMs } = parseDayKeyToTzRange(endDayKey, timezone);

	// Pad query for correct credit computation
	const queryFromMs = weekStartMs - IDLE_CUTOFF_MS;

	// Fetch heartbeats and all overrides in parallel
	// Overrides are fetched without date filter so persistent overrides always apply
	const [{ rows: windowEvents, scanned }, allOverrides] = await Promise.all([
		fetchEventsPaged(db, userId, queryFromMs, weekEndMs, ['artifact_active'], MAX_EVENTS_PER_REQUEST),
		fetchAllOverrides(db, userId),
	]);

	if (scanned >= MAX_EVENTS_PER_REQUEST) {
		return { ok: false, error: 'RANGE_TOO_LARGE' };
	}

	// Merge overrides with window events (deduped and sorted)
	const rows = mergeWithOverrides(windowEvents, allOverrides);

	const creditIndex = computeCreditIndex(rows, timezone, weekStartMs, weekEndMs);

	// Build 7-day series
	const dayKeys: string[] = [];
	const days: DashboardWeekResponse['week']['days'] = [];

	for (let i = 0; i < 7; i++) {
		const dayKey = addDays(startDayKey, i);
		dayKeys.push(dayKey);
		days.push({
			date: dayKey,
			dayLabel: weekdayLabel(dayKey, timezone),
			minutes: msToMinutes(creditIndex.totalMsByDay.get(dayKey) ?? 0),
		});
	}

	// Week breakdown
	const topics = buildWeekBreakdown(creditIndex.msByDayAndTopic, dayKeys, (key, minutes) => {
		const topic = key as TopicSlug;
		return { id: topic, label: TOPIC_LABELS[topic] ?? topic, minutes };
	});

	const sources = buildWeekBreakdown(creditIndex.msByDayAndHost, dayKeys, (key, minutes) => {
		return { id: key, label: key, minutes };
	});

	return {
		ok: true,
		data: {
			week: { days },
			weekBreakdown: { topics, sources },
		},
	};
}
