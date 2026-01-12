/**
 * Event ingest routes (events-first telemetry MVP).
 *
 * POST /events/ingest - ingest append-only telemetry events (idempotent)
 * GET /events/export - export events as NDJSON stream
 */

import { and, eq, gt, gte, inArray, lte, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import * as v from 'valibot';
import { device as deviceTable, event as eventTable } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
import { checkRateLimit } from '../../shared/rate-limit';
import {
	ExportEventsQuerySchema,
	IngestEventsRequestSchema,
	type TelemetryEventInput,
	TelemetryEventSchema,
} from './validation/events.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type EventRow = typeof eventTable.$inferSelect;
type WhereClause = ReturnType<typeof and>;

function firstIssueMessage(issues: v.BaseIssue<unknown>[] | undefined): string {
	return issues?.[0]?.message ?? 'Validation failed';
}

export const eventsRoutes = app
	.post('/ingest', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const rawDb = c.env.DB;
		const receivedAt = new Date();
		const serverTimeMs = receivedAt.getTime();

		const body = (await c.req.json()) as unknown;
		const base = v.safeParse(IngestEventsRequestSchema, body);
		if (!base.success) {
			return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(base.issues));
		}

		const events = base.output.events as unknown[];

		// Rate limiting: distributed via CF Rate Limiting API (per-batch, not per-event)
		const rateLimit = await checkRateLimit(c.env.INGEST_RATE_LIMITER, userId);
		if (!rateLimit.allowed) {
			return apiError(c, 429, 'RATE_LIMIT_EXCEEDED', 'Rate limit exceeded. Please wait before sending more events.');
		}
		const rejected: Array<{ index: number; event_id?: string; reason: string }> = [];
		const validEvents: TelemetryEventInput[] = [];

		for (let i = 0; i < events.length; i += 1) {
			const rawEvent = events[i];
			const parsed = v.safeParse(TelemetryEventSchema, rawEvent);
			if (!parsed.success) {
				const eventId =
					typeof rawEvent === 'object' && rawEvent !== null && 'event_id' in rawEvent && typeof (rawEvent as any).event_id === 'string'
						? ((rawEvent as any).event_id as string)
						: undefined;

				rejected.push({ index: i, event_id: eventId, reason: firstIssueMessage(parsed.issues) });
				continue;
			}
			validEvents.push(parsed.output);
		}

		if (validEvents.length === 0) {
			return c.json({ validated: 0, inserted: 0, rejected, server_time_ms: serverTimeMs });
		}

		const uniqueDeviceIds = Array.from(new Set(validEvents.map((e) => e.device_id)));

		// Verify device ownership to prevent data integrity violations:
		// Clients must not send events with device_ids owned by other users
		const existingDevices =
			uniqueDeviceIds.length > 0
				? await db.select({ id: deviceTable.id, userId: deviceTable.userId }).from(deviceTable).where(inArray(deviceTable.id, uniqueDeviceIds))
				: [];

		const deviceOwnerMap = new Map(existingDevices.map((d) => [d.id, d.userId]));

		// Track which events should be rejected due to device ownership violations
		const rejectedEventIds = new Set<string>();
		for (const e of validEvents) {
			const existingOwnerId = deviceOwnerMap.get(e.device_id);
			if (existingOwnerId && existingOwnerId !== userId) {
				rejectedEventIds.add(e.event_id);
				// Find the original index in the events array for accurate error reporting
				const originalIndex = events.findIndex(
					(evt) => evt === e || (typeof evt === 'object' && evt !== null && 'event_id' in evt && (evt as any).event_id === e.event_id)
				);
				rejected.push({
					index: originalIndex >= 0 ? originalIndex : events.length,
					event_id: e.event_id,
					reason: 'Device belongs to another user',
				});
			}
		}

		// Filter to only safe events (devices are new or owned by this user)
		const safeEvents = validEvents.filter((e) => !rejectedEventIds.has(e.event_id));

		if (safeEvents.length === 0) {
			return c.json({ validated: 0, inserted: 0, rejected, server_time_ms: serverTimeMs });
		}

		// Only process devices that passed ownership check
		const safeDeviceIds = Array.from(new Set(safeEvents.map((e) => e.device_id)));

		const statements: D1PreparedStatement[] = [];

		for (const deviceId of safeDeviceIds) {
			const stmt = db
				.insert(deviceTable)
				.values({
					id: deviceId,
					userId,
					type: 'chrome_extension',
					installedAt: receivedAt,
					lastSeenAt: receivedAt,
				})
				.onConflictDoUpdate({
					target: deviceTable.id,
					set: { lastSeenAt: receivedAt },
				})
				.toSQL();
			statements.push(rawDb.prepare(stmt.sql).bind(...stmt.params));
		}

		for (const e of safeEvents) {
			const artifact = e.artifact;

			const stmt = db
				.insert(eventTable)
				.values({
					userId,
					deviceId: e.device_id,
					eventId: e.event_id,
					schemaVersion: e.schema_version,
					type: e.type,
					emittedAt: new Date(e.emitted_at),
					receivedAt,
					artifactHost: artifact?.host ?? null,
					artifactUrlHash: artifact?.url_hash ?? null,
					artifactPathHint: artifact?.path_hint ?? null,
					titleHint: artifact?.title_hint ?? null,
					payloadJson: JSON.stringify(e.payload),
				})
				.onConflictDoNothing()
				.toSQL();

			statements.push(rawDb.prepare(stmt.sql).bind(...stmt.params));
		}

		const results = await rawDb.batch(statements);

		// Count actual event inserts (skip device upserts at the start)
		const deviceStatementCount = safeDeviceIds.length;
		const eventResults = results.slice(deviceStatementCount);
		const inserted = eventResults.filter((r) => r.meta.rows_written > 0).length;

		return c.json({
			validated: events.length - rejected.length,
			inserted,
			rejected,
			server_time_ms: serverTimeMs,
		});
	})
	/**
	 * GET /export - Export events as NDJSON stream
	 *
	 * Query params:
	 * - from: YYYY-MM-DD (UTC date, inclusive)
	 * - to: YYYY-MM-DD (UTC date, inclusive)
	 * - format: 'ndjson' (required)
	 *
	 * Streams events ordered by (emitted_at ASC, device_id ASC, event_id ASC).
	 * Uses composite cursor for pagination.
	 *
	 * Limits:
	 * - Max 100,000 events per export request
	 * - Future: pagination token support for resumable exports
	 */
	.get('/export', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const query = c.req.query();
		const parsed = v.safeParse(ExportEventsQuerySchema, query);

		if (!parsed.success) {
			return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(parsed.issues));
		}

		const { from, to } = parsed.output;

		// Parse from/to as UTC dates (inclusive)
		const [fromY, fromM, fromD] = from.split('-').map(Number);
		const [toY, toM, toD] = to.split('-').map(Number);
		const fromMs = Date.UTC(fromY, fromM - 1, fromD, 0, 0, 0, 0);
		const toMs = Date.UTC(toY, toM - 1, toD, 23, 59, 59, 999);

		// Validate date range
		if (fromMs > toMs) {
			return apiError(c, 400, 'VALIDATION_ERROR', "'from' date must be before or equal to 'to' date");
		}

		const PAGE_SIZE = 1000;
		const MAX_TOTAL_ROWS = 100_000;

		return stream(c, async (s) => {
			// Set content type for NDJSON
			c.header('Content-Type', 'application/x-ndjson');

			let cursor: { emittedAt: Date; deviceId: string; eventId: string } | null = null;
			let hasMore = true;
			let totalExported = 0;
			let headerSet = false;

			try {
				while (hasMore && totalExported < MAX_TOTAL_ROWS) {
					const baseWhere: WhereClause = and(
						eq(eventTable.userId, userId),
						gte(eventTable.emittedAt, new Date(fromMs)),
						lte(eventTable.emittedAt, new Date(toMs))
					);

					const cursorWhere: WhereClause = cursor
						? and(
								baseWhere,
								or(
									gt(eventTable.emittedAt, cursor.emittedAt),
									and(eq(eventTable.emittedAt, cursor.emittedAt), gt(eventTable.deviceId, cursor.deviceId)),
									and(eq(eventTable.emittedAt, cursor.emittedAt), eq(eventTable.deviceId, cursor.deviceId), gt(eventTable.eventId, cursor.eventId))
								)
							)
						: baseWhere;

					// Fetch one extra row to accurately detect if more data exists
					const rows: EventRow[] = await db
						.select()
						.from(eventTable)
						.where(cursorWhere)
						.orderBy(eventTable.emittedAt, eventTable.deviceId, eventTable.eventId)
						.limit(PAGE_SIZE + 1);

					if (rows.length === 0) {
						hasMore = false;
						break;
					}

					// Check if there's more data beyond this page
					const hasMoreInDb = rows.length > PAGE_SIZE;
					const pageRows = hasMoreInDb ? rows.slice(0, PAGE_SIZE) : rows;

					// Determine how many rows we can process without exceeding the limit
					const remainingCapacity = MAX_TOTAL_ROWS - totalExported;
					const toProcess: EventRow[] = pageRows.slice(0, remainingCapacity);

					// Check if we're truncating: either we fetched more than capacity,
					// or we're at capacity and there's confirmed more data in DB
					const wouldTruncate = pageRows.length > remainingCapacity || (toProcess.length === remainingCapacity && hasMoreInDb);
					if (wouldTruncate && !headerSet) {
						c.header('X-Export-Truncated', 'true');
						headerSet = true;
					}

					for (const row of toProcess) {
						// Build event envelope (exclude user_id)
						const artifact =
							row.artifactHost && row.artifactUrlHash
								? {
										host: row.artifactHost,
										url_hash: row.artifactUrlHash,
										...(row.artifactPathHint && { path_hint: row.artifactPathHint }),
										...(row.titleHint && { title_hint: row.titleHint }),
									}
								: null;

						const envelope = {
							schema_version: row.schemaVersion,
							event_id: row.eventId,
							device_id: row.deviceId,
							emitted_at: row.emittedAt.getTime(),
							received_at: row.receivedAt.getTime(),
							type: row.type,
							...(artifact && { artifact }),
							payload: JSON.parse(row.payloadJson),
						};

						try {
							await s.write(JSON.stringify(envelope) + '\n');
							totalExported += 1;
						} catch (writeError) {
							// Client disconnected or write failed - abort stream gracefully
							console.error('Stream write failed:', writeError);
							hasMore = false;
							break;
						}
					}

					// Update cursor for next page
					if (!hasMoreInDb || toProcess.length < pageRows.length) {
						// No more data in DB, or we couldn't process the full page (hit limit)
						hasMore = false;
					} else if (totalExported >= MAX_TOTAL_ROWS) {
						// Reached max export limit - truncation header already set above if needed
						hasMore = false;
					} else {
						const last: EventRow = toProcess[toProcess.length - 1]!;
						cursor = { emittedAt: last.emittedAt, deviceId: last.deviceId, eventId: last.eventId };
					}
				}
			} catch (error) {
				// Handle unexpected errors during query or processing
				console.error('Stream processing failed:', error);
				// Attempt to write error to stream if still connected
				try {
					await s.write(JSON.stringify({ error: 'Stream processing failed' }) + '\n');
				} catch {
					// Client already disconnected, cleanup silently
				}
			}
		});
	});
