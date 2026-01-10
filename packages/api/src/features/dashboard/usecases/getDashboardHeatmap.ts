/**
 * GET /api/dashboard/heatmap usecase.
 *
 * Returns:
 * - data: { year, timezone, days: [{ date, minutes }] }
 * - stats: { totalMinutes, avgPerDay, activeDays }
 *
 * Computes in pages (month-by-month) to avoid huge memory use.
 */

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { event as eventTable, type schema } from '../../../db';
import { computeCreditIndex, IDLE_CUTOFF_MS, msToMinutes } from '../rollups/credit';
import { daysInYear, formatDayKey, getYearBoundariesInTz } from '../rollups/time';
import type { DashboardHeatmapResponse, DbEventRow, HeatmapDay } from '../rollups/types';

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
	types: string[],
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
					inArray(eventTable.type, types as any),
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
						inArray(eventTable.type, types as any),
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

export async function getDashboardHeatmap(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	year: number,
	timezone: string
): Promise<{ ok: true; data: DashboardHeatmapResponse } | { ok: false; error: 'RANGE_TOO_LARGE' }> {
	const { startMs: yearStartMs, endMs: yearEndMs } = getYearBoundariesInTz(year, timezone);

	// Pad query for correct credit computation
	const queryFromMs = yearStartMs - IDLE_CUTOFF_MS;

	const { rows, scanned } = await fetchEventsPaged(
		db,
		userId,
		queryFromMs,
		yearEndMs,
		['artifact_active', 'topic_override'],
		MAX_EVENTS_PER_REQUEST
	);

	if (scanned >= MAX_EVENTS_PER_REQUEST) {
		return { ok: false, error: 'RANGE_TOO_LARGE' };
	}

	const creditIndex = computeCreditIndex(rows, timezone, yearStartMs, yearEndMs);

	// Build days array for the full year
	const days: HeatmapDay[] = [];
	const numDays = daysInYear(year);

	let totalMinutes = 0;
	let activeDays = 0;

	for (let i = 0; i < numDays; i++) {
		// Create date at noon UTC to avoid DST issues
		const ms = Date.UTC(year, 0, 1 + i, 12, 0, 0);
		const dayKey = formatDayKey(ms, timezone);
		const minutes = msToMinutes(creditIndex.totalMsByDay.get(dayKey) ?? 0);

		days.push({ date: dayKey, minutes });

		if (minutes > 0) {
			activeDays++;
			totalMinutes += minutes;
		}
	}

	const avgPerDay = activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0;

	return {
		ok: true,
		data: {
			data: { year, timezone, days },
			stats: { totalMinutes, avgPerDay, activeDays },
		},
	};
}
