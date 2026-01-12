/**
 * GET /api/dashboard/today usecase.
 *
 * Returns:
 * - todayHero: { todayMinutes, sevenDayAvgMinutes }
 * - streak: { currentStreak, minMinutesThreshold }
 * - todayBreakdown: { topics, sources }
 * - topSource: { source, minutes } (computed over last 7 days)
 * - topTopic: { topic, minutes, weeklyTotalMinutes } (computed over last 7 days)
 * - todayCaptures: { count, items }
 */

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { event as eventTable, type schema } from '../../../db';
import { computeCreditIndex, IDLE_CUTOFF_MS, MIN_ACTIVE_MINUTES_FOR_STREAK, msToMinutes } from '../rollups/credit';
import { addDays, getTodayKey, parseDayKeyToTzRange } from '../rollups/time';
import { TOPIC_LABELS } from '../rollups/topics';
import type { BreakdownItem, CaptureItem, CapturePayload, DashboardTodayResponse, DbEventRow, TopicSlug } from '../rollups/types';

const MAX_EVENTS_PER_REQUEST = 250_000;
const PAGE_SIZE = 10_000;
const STREAK_PAGE_DAYS = 7;
const MAX_STREAK_DAYS = 365;

interface FetchEventsResult {
	rows: DbEventRow[];
	scanned: number;
}

/**
 * Fetch events with pagination, respecting scan limit.
 *
 * PAGINATION STRATEGY:
 *
 * This function uses cursor-based pagination with an over-fetch approach to handle
 * composite key pagination correctly in SQLite/D1.
 *
 * 1. CURSOR-BASED PAGINATION:
 *    - The cursor is a composite key: (emittedAt, deviceId, eventId)
 *    - This ensures stable, deterministic ordering across pages
 *    - For each page after the first, we continue from where the previous page ended
 *
 * 2. WHY OVER-FETCH:
 *    - SQLite doesn't support tuple comparison (WHERE (a,b,c) > (cursor_a, cursor_b, cursor_c))
 *    - We approximate with gte(emittedAt, cursor.emittedAt), which may return rows
 *      we've already seen (when emittedAt equals cursor.emittedAt)
 *    - We over-fetch by 100 rows to ensure we get enough NEW rows after filtering
 *    - The filter step removes duplicates, then we slice to the exact page size
 *
 * 3. SCAN LIMIT vs PAGE_SIZE:
 *    - PAGE_SIZE (10,000): Controls how many rows we fetch per database query
 *    - maxScan: Global limit across all pages to prevent unbounded queries
 *    - remaining = min(PAGE_SIZE, maxScan - scanned): Ensures we don't exceed maxScan
 *    - The over-fetch (+100) may cause us to fetch slightly more, but scanned only
 *      counts rows we actually return (after filtering and slicing)
 */
async function fetchEventsPaged(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	fromMs: number,
	toMs: number,
	types: string[],
	maxScan: number
): Promise<FetchEventsResult> {
	const rows: DbEventRow[] = [];
	let cursor: { emittedAt: Date; deviceId: string; eventId: string } | null = null;
	let scanned = 0;

	while (scanned < maxScan) {
		// Calculate how many more rows we're allowed to scan
		const remaining = Math.min(PAGE_SIZE, maxScan - scanned);

		let query = db
			.select()
			.from(eventTable)
			.where(
				and(
					eq(eventTable.userId, userId),
					inArray(eventTable.type, types as any),
					gte(eventTable.emittedAt, new Date(fromMs)),
					lte(eventTable.emittedAt, new Date(toMs))
				)
			)
			.orderBy(eventTable.emittedAt, eventTable.deviceId, eventTable.eventId)
			.limit(remaining);

		if (cursor) {
			// Continue from cursor (composite key pagination)
			// SQLite doesn't have row comparison, so we approximate with gte on the first component
			query = db
				.select()
				.from(eventTable)
				.where(
					and(
						eq(eventTable.userId, userId),
						inArray(eventTable.type, types as any),
						gte(eventTable.emittedAt, new Date(fromMs)),
						lte(eventTable.emittedAt, new Date(toMs)),
						// Composite cursor: (emittedAt, deviceId, eventId) > cursor
						// We approximate with gte(emittedAt) because SQLite lacks tuple comparison.
						// This means we may get rows where emittedAt = cursor.emittedAt that we've
						// already seen, which we'll filter out below.
						gte(eventTable.emittedAt, cursor.emittedAt)
					)
				)
				.orderBy(eventTable.emittedAt, eventTable.deviceId, eventTable.eventId)
				// Over-fetch to compensate for duplicates we'll filter out
				// +100 is a heuristic buffer to ensure we get enough new rows
				.limit(remaining + 100);
		}

		const page = await query;
		if (page.length === 0) break;

		// Filter out rows at or before cursor (removes duplicates from over-fetch)
		let filtered = page;
		if (cursor) {
			filtered = page.filter((r) => {
				// Implement lexicographic comparison: (emittedAt, deviceId, eventId) > cursor
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

		// Take exactly the number of rows we need (respecting the scan limit)
		const toTake = filtered.slice(0, remaining);
		rows.push(...toTake);
		scanned += toTake.length;

		if (toTake.length < remaining) break; // No more data available

		// Set cursor to the last row we took for the next iteration
		const last = toTake[toTake.length - 1];
		cursor = { emittedAt: last.emittedAt, deviceId: last.deviceId, eventId: last.eventId };
	}

	return { rows, scanned };
}

/**
 * Compute streak by paging backwards until first inactive day.
 */
async function computeStreak(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	timezone: string,
	todayKey: string,
	maxScanTotal: number
): Promise<{ ok: true; streak: number; scanned: number } | { ok: false; error: 'RANGE_TOO_LARGE' }> {
	let streak = 0;
	let dayOffset = 0;
	let scannedTotal = 0;

	while (dayOffset < MAX_STREAK_DAYS) {
		const remainingScan = maxScanTotal - scannedTotal;
		if (remainingScan <= 0) return { ok: false, error: 'RANGE_TOO_LARGE' };

		// Fetch a chunk of days
		const endDayKey = addDays(todayKey, -dayOffset);
		const startDayKey = addDays(todayKey, -dayOffset - STREAK_PAGE_DAYS + 1);

		const { startMs: rangeStartMs } = parseDayKeyToTzRange(startDayKey, timezone);
		const { endMs: rangeEndMs } = parseDayKeyToTzRange(endDayKey, timezone);

		// Pad the query for correct credit computation
		const queryFromMs = rangeStartMs - IDLE_CUTOFF_MS;

		const { rows, scanned } = await fetchEventsPaged(
			db,
			userId,
			queryFromMs,
			rangeEndMs,
			['artifact_active', 'topic_override'],
			remainingScan
		);

		scannedTotal += scanned;
		if (scannedTotal >= maxScanTotal) return { ok: false, error: 'RANGE_TOO_LARGE' };

		const creditIndex = computeCreditIndex(rows, timezone, rangeStartMs, rangeEndMs);

		// Check each day in the chunk (from most recent to oldest)
		for (let i = 0; i < STREAK_PAGE_DAYS && dayOffset + i < MAX_STREAK_DAYS; i++) {
			const dayKey = addDays(todayKey, -(dayOffset + i));
			const minutes = msToMinutes(creditIndex.totalMsByDay.get(dayKey) ?? 0);

			if (minutes >= MIN_ACTIVE_MINUTES_FOR_STREAK) {
				streak++;
			} else {
				return { ok: true, streak, scanned: scannedTotal }; // First inactive day found
			}
		}

		dayOffset += STREAK_PAGE_DAYS;
	}

	return { ok: true, streak, scanned: scannedTotal };
}

/**
 * Build breakdown items from credit index.
 */
function buildBreakdown(
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

export async function getDashboardToday(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	timezone: string,
	nowMs: number = Date.now()
): Promise<{ ok: true; data: DashboardTodayResponse } | { ok: false; error: 'RANGE_TOO_LARGE' }> {
	const todayKey = getTodayKey(timezone, nowMs);

	// We need 7 days of data for hero stats and top cards
	const startDayKey = addDays(todayKey, -6);
	const { startMs: sevenDayStartMs } = parseDayKeyToTzRange(startDayKey, timezone);
	const { endMs: todayEndMs } = parseDayKeyToTzRange(todayKey, timezone);

	// Pad query for correct credit computation
	const queryFromMs = sevenDayStartMs - IDLE_CUTOFF_MS;

	const { rows, scanned } = await fetchEventsPaged(
		db,
		userId,
		queryFromMs,
		todayEndMs,
		['artifact_active', 'capture', 'topic_override'],
		MAX_EVENTS_PER_REQUEST
	);

	if (scanned >= MAX_EVENTS_PER_REQUEST) {
		return { ok: false, error: 'RANGE_TOO_LARGE' };
	}

	// Compute credit index for the 7-day window
	const creditIndex = computeCreditIndex(rows, timezone, sevenDayStartMs, todayEndMs);

	// Today hero
	const todayMinutes = msToMinutes(creditIndex.totalMsByDay.get(todayKey) ?? 0);
	const sevenDayDays: string[] = [];
	for (let i = 0; i < 7; i++) sevenDayDays.push(addDays(todayKey, -i));
	const sevenDayTotal = sevenDayDays.reduce((sum, k) => sum + msToMinutes(creditIndex.totalMsByDay.get(k) ?? 0), 0);
	const sevenDayAvgMinutes = Math.round(sevenDayTotal / 7);

	// Today breakdown
	const todayPrefix = `${todayKey}|`;
	const topics = buildBreakdown(creditIndex.msByDayAndTopic, todayPrefix, (key, minutes) => {
		const topic = key.split('|')[1] as TopicSlug;
		return { id: topic, label: TOPIC_LABELS[topic] ?? topic, minutes };
	});
	const sources = buildBreakdown(creditIndex.msByDayAndHost, todayPrefix, (key, minutes) => {
		const host = key.split('|')[1];
		return { id: host, label: host, minutes };
	});

	// Top source (7-day)
	const weeklyHostTotals = new Map<string, number>();
	for (const dayKey of sevenDayDays) {
		for (const [k, v] of creditIndex.msByDayAndHost) {
			if (!k.startsWith(`${dayKey}|`)) continue;
			const host = k.split('|')[1];
			weeklyHostTotals.set(host, (weeklyHostTotals.get(host) ?? 0) + v);
		}
	}
	let topSource = { source: '', minutes: 0 };
	for (const [host, ms] of weeklyHostTotals) {
		const minutes = msToMinutes(ms);
		if (minutes > topSource.minutes) {
			topSource = { source: host, minutes };
		}
	}

	// Top topic (7-day)
	const weeklyTopicTotals = new Map<TopicSlug, number>();
	for (const dayKey of sevenDayDays) {
		for (const [k, v] of creditIndex.msByDayAndTopic) {
			if (!k.startsWith(`${dayKey}|`)) continue;
			const topic = k.split('|')[1] as TopicSlug;
			weeklyTopicTotals.set(topic, (weeklyTopicTotals.get(topic) ?? 0) + v);
		}
	}
	let topTopic = { topic: '', minutes: 0, weeklyTotalMinutes: 0 };
	let weeklyTotalMs = 0;
	for (const [topic, ms] of weeklyTopicTotals) {
		weeklyTotalMs += ms;
		const minutes = msToMinutes(ms);
		if (minutes > topTopic.minutes) {
			topTopic = { topic: TOPIC_LABELS[topic] ?? topic, minutes, weeklyTotalMinutes: 0 };
		}
	}
	topTopic.weeklyTotalMinutes = msToMinutes(weeklyTotalMs);

	// Today captures
	const { startMs: todayStartMs } = parseDayKeyToTzRange(todayKey, timezone);
	const captures: Array<CaptureItem & { emitted_at: number }> = [];
	for (const row of rows) {
		if (row.type !== 'capture') continue;
		const emittedAtMs = row.emittedAt.getTime();
		if (emittedAtMs < todayStartMs || emittedAtMs > todayEndMs) continue;

		const payload = JSON.parse(row.payloadJson) as CapturePayload;
		captures.push({
			id: row.eventId,
			type: payload.capture_type,
			label: payload.label,
			source: row.artifactHost ?? 'unknown',
			emitted_at: emittedAtMs,
		});
	}
	captures.sort((a, b) => b.emitted_at - a.emitted_at);
	const todayCaptures = {
		count: captures.length,
		items: captures.map(({ emitted_at: _, ...rest }) => rest),
	};

	// Streak (computed separately with paging)
	const streakScanBudget = MAX_EVENTS_PER_REQUEST - scanned;
	const streakResult = await computeStreak(db, userId, timezone, todayKey, streakScanBudget);
	if (!streakResult.ok) return { ok: false, error: 'RANGE_TOO_LARGE' };
	const currentStreak = streakResult.streak;

	return {
		ok: true,
		data: {
			todayHero: { todayMinutes, sevenDayAvgMinutes },
			streak: { currentStreak, minMinutesThreshold: MIN_ACTIVE_MINUTES_FOR_STREAK },
			todayBreakdown: { topics, sources },
			topSource,
			topTopic,
			todayCaptures,
		},
	};
}
