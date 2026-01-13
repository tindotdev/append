/**
 * GET /api/dashboard/heatmap usecase.
 *
 * Returns:
 * - data: { year, timezone, days: [{ date, minutes }] }
 * - stats: { totalMinutes, avgPerDay, activeDays }
 *
 * Computes in pages (month-by-month) to avoid huge memory use.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../../../db';
import { fetchAllOverrides, fetchEventsPaged, MAX_EVENTS_PER_REQUEST, mergeWithOverrides } from '../data/event-fetcher';
import { computeCreditIndex, IDLE_CUTOFF_MS, msToMinutes } from '../rollups/credit';
import { daysInYear, formatDayKey, getYearBoundariesInTz } from '../rollups/time';
import type { DashboardHeatmapResponse, HeatmapDay } from '../rollups/types';

export async function getDashboardHeatmap(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	year: number,
	timezone: string
): Promise<{ ok: true; data: DashboardHeatmapResponse } | { ok: false; error: 'RANGE_TOO_LARGE' }> {
	const { startMs: yearStartMs, endMs: yearEndMs } = getYearBoundariesInTz(year, timezone);

	// Pad query for correct credit computation
	const queryFromMs = yearStartMs - IDLE_CUTOFF_MS;

	// Fetch heartbeats and all overrides in parallel
	// Overrides are fetched without date filter so persistent overrides always apply
	const [{ rows: windowEvents, scanned }, allOverrides] = await Promise.all([
		fetchEventsPaged(db, userId, queryFromMs, yearEndMs, ['artifact_active'], MAX_EVENTS_PER_REQUEST),
		fetchAllOverrides(db, userId),
	]);

	if (scanned >= MAX_EVENTS_PER_REQUEST) {
		return { ok: false, error: 'RANGE_TOO_LARGE' };
	}

	// Merge overrides with window events (deduped and sorted)
	const rows = mergeWithOverrides(windowEvents, allOverrides);

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
