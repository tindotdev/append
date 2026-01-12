/**
 * GET /api/dashboard/week usecase.
 *
 * Returns:
 * - week: { days: [{ date, dayLabel, minutes }] } - 7-day series
 * - weekBreakdown: { topics, sources } - aggregated for the week
 */

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type EventType, event as eventTable, type schema } from '../../../db';
import { computeCreditIndex, IDLE_CUTOFF_MS, msToMinutes } from '../rollups/credit';
import { addDays, parseDayKeyToTzRange, weekdayLabel } from '../rollups/time';
import { TOPIC_LABELS } from '../rollups/topics';
import type { BreakdownItem, DashboardWeekResponse, DbEventRow, TopicSlug } from '../rollups/types';

const MAX_EVENTS_PER_REQUEST = 250_000;
const PAGE_SIZE = 10_000;

interface FetchEventsResult {
	rows: DbEventRow[];
	scanned: number;
}

/**
 * Fetch events with pagination, respecting scan limit.
 */
async function fetchEventsPaged(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	fromMs: number,
	toMs: number,
	types: readonly EventType[],
	maxScan: number
): Promise<FetchEventsResult> {
	const rows: DbEventRow[] = [];
	let cursor: { emittedAt: Date; deviceId: string; eventId: string } | null = null;
	let scanned = 0;

	while (scanned < maxScan) {
		const remaining = Math.min(PAGE_SIZE, maxScan - scanned);

		let query = db
			.select()
			.from(eventTable)
			.where(
				and(
					eq(eventTable.userId, userId),
					inArray(eventTable.type, types),
					gte(eventTable.emittedAt, new Date(fromMs)),
					lte(eventTable.emittedAt, new Date(toMs))
				)
			)
			.orderBy(eventTable.emittedAt, eventTable.deviceId, eventTable.eventId)
			.limit(remaining);

		if (cursor) {
			query = db
				.select()
				.from(eventTable)
				.where(
					and(
						eq(eventTable.userId, userId),
						inArray(eventTable.type, types),
						gte(eventTable.emittedAt, new Date(fromMs)),
						lte(eventTable.emittedAt, new Date(toMs)),
						gte(eventTable.emittedAt, cursor.emittedAt)
					)
				)
				.orderBy(eventTable.emittedAt, eventTable.deviceId, eventTable.eventId)
				.limit(remaining + 100);
		}

		const page = await query;
		if (page.length === 0) break;

		let filtered = page;
		if (cursor) {
			filtered = page.filter((r) => {
				const rMs = r.emittedAt.getTime();
				const cMs = cursor!.emittedAt.getTime();
				if (rMs > cMs) return true;
				if (rMs < cMs) return false;
				if (r.deviceId > cursor!.deviceId) return true;
				if (r.deviceId < cursor!.deviceId) return false;
				return r.eventId > cursor!.eventId;
			});
		}

		if (filtered.length === 0) break;

		const toTake = filtered.slice(0, remaining);
		rows.push(...toTake);
		scanned += toTake.length;

		if (toTake.length < remaining) break;

		const last = toTake[toTake.length - 1];
		cursor = { emittedAt: last.emittedAt, deviceId: last.deviceId, eventId: last.eventId };
	}

	return { rows, scanned };
}

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

	const { rows, scanned } = await fetchEventsPaged(
		db,
		userId,
		queryFromMs,
		weekEndMs,
		['artifact_active', 'topic_override'],
		MAX_EVENTS_PER_REQUEST
	);

	if (scanned >= MAX_EVENTS_PER_REQUEST) {
		return { ok: false, error: 'RANGE_TOO_LARGE' };
	}

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
