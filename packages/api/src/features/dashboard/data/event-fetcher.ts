/**
 * Shared event fetching utilities for dashboard usecases.
 *
 * This module provides cursor-based paginated event fetching with scan limits,
 * override handling, and event merging for dashboard queries.
 */

import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type EventType, event as eventTable, type schema } from '../../../db';
import type { DbEventRow } from '../rollups/types';

export const MAX_EVENTS_PER_REQUEST = 250_000;
export const PAGE_SIZE = 10_000;
export const MAX_OVERRIDES = 1_000;

export interface FetchEventsResult {
	rows: DbEventRow[];
	scanned: number;
}

type EventCursor = { emittedAt: Date; deviceId: string; eventId: string };

function isRowAfterCursor(row: DbEventRow, cursor: EventCursor): boolean {
	// Implement lexicographic comparison: (emittedAt, deviceId, eventId) > cursor
	const rowMs = row.emittedAt.getTime();
	const cursorMs = cursor.emittedAt.getTime();
	if (rowMs !== cursorMs) return rowMs > cursorMs;
	if (row.deviceId !== cursor.deviceId) return row.deviceId > cursor.deviceId;
	return row.eventId > cursor.eventId;
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
export async function fetchEventsPaged(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	fromMs: number,
	toMs: number,
	types: readonly EventType[],
	maxScan: number
): Promise<FetchEventsResult> {
	const rows: DbEventRow[] = [];
	let cursor: EventCursor | null = null;
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
					inArray(eventTable.type, types),
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
						inArray(eventTable.type, types),
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
			const currentCursor = cursor;
			filtered = page.filter((r) => isRowAfterCursor(r, currentCursor));
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
 * Fetch all topic_override events for a user without date filter.
 * Used to ensure persistent overrides apply regardless of when they were emitted.
 * Bounded by MAX_OVERRIDES to prevent unbounded queries.
 */
export async function fetchAllOverrides(db: DrizzleD1Database<typeof schema>, userId: string): Promise<DbEventRow[]> {
	// Order DESC so newest overrides are fetched first and kept when hitting the limit.
	// This ensures the latest override wins when resolving topics.
	return db
		.select()
		.from(eventTable)
		.where(and(eq(eventTable.userId, userId), eq(eventTable.type, 'topic_override')))
		.orderBy(desc(eventTable.emittedAt))
		.limit(MAX_OVERRIDES);
}

/**
 * Merge overrides with other events, ensuring sorted order by emittedAt.
 */
export function mergeWithOverrides(events: DbEventRow[], overrides: DbEventRow[]): DbEventRow[] {
	// Dedupe overrides that might already be in events (within the time window)
	const eventIds = new Set(events.map((e) => e.eventId));
	const uniqueOverrides = overrides.filter((o) => !eventIds.has(o.eventId));

	// Merge and sort by emittedAt
	return [...events, ...uniqueOverrides].sort((a, b) => a.emittedAt.getTime() - b.emittedAt.getTime());
}
