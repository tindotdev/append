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
	decodeCursor,
	ExportEventsQuerySchema,
	encodeCursor,
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

function parsePositiveInt(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const int = Math.floor(parsed);
	if (int <= 0) return null;
	return int;
}

function getExportConfig(env: Bindings): { pageSize: number; maxTotalRows: number } {
	const pageSize = parsePositiveInt(env.EVENTS_EXPORT_PAGE_SIZE) ?? 1000;
	const maxTotalRows = parsePositiveInt(env.EVENTS_EXPORT_MAX_TOTAL_ROWS) ?? 100_000;
	return { pageSize, maxTotalRows };
}

function buildExportCursorWhere(opts: {
	userId: string;
	fromMs: number;
	toMs: number;
	cursor: { emittedAt: Date; deviceId: string; eventId: string } | null;
}): WhereClause {
	const baseWhere: WhereClause = and(
		eq(eventTable.userId, opts.userId),
		gte(eventTable.emittedAt, new Date(opts.fromMs)),
		lte(eventTable.emittedAt, new Date(opts.toMs))
	);

	if (!opts.cursor) return baseWhere;

	return and(
		baseWhere,
		or(
			gt(eventTable.emittedAt, opts.cursor.emittedAt),
			and(eq(eventTable.emittedAt, opts.cursor.emittedAt), gt(eventTable.deviceId, opts.cursor.deviceId)),
			and(
				eq(eventTable.emittedAt, opts.cursor.emittedAt),
				eq(eventTable.deviceId, opts.cursor.deviceId),
				gt(eventTable.eventId, opts.cursor.eventId)
			)
		)
	);
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
	 * - cursor: base64url-encoded cursor for resuming truncated exports (optional)
	 *
	 * Streams events ordered by (emitted_at ASC, device_id ASC, event_id ASC).
	 * Uses composite cursor for pagination.
	 *
	 * Limits:
	 * - Max 100,000 events per export request (configurable via EVENTS_EXPORT_MAX_TOTAL_ROWS)
	 *
	 * Response (when truncated):
	 * - Status: 206 Partial Content
	 *
	 * Response headers (when truncated):
	 * - X-Export-Truncated: 'true' - indicates more data exists
	 * - X-Export-Cursor: cursor token for resuming from last exported event
	 */
	.get('/export', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const query = c.req.query();
		const parsed = v.safeParse(ExportEventsQuerySchema, query);

		if (!parsed.success) {
			return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(parsed.issues));
		}

		const { from, to, cursor: cursorParam } = parsed.output;

		// Parse from/to as UTC dates (inclusive)
		const [fromY, fromM, fromD] = from.split('-').map(Number);
		const [toY, toM, toD] = to.split('-').map(Number);
		const fromMs = Date.UTC(fromY, fromM - 1, fromD, 0, 0, 0, 0);
		const toMs = Date.UTC(toY, toM - 1, toD, 23, 59, 59, 999);

		// Validate date range
		if (fromMs > toMs) {
			return apiError(c, 400, 'VALIDATION_ERROR', "'from' date must be before or equal to 'to' date");
		}

		// Parse incoming cursor for resumable exports
		let initialCursor: { emittedAt: Date; deviceId: string; eventId: string } | null = null;
		if (cursorParam) {
			const decoded = decodeCursor(cursorParam);
			initialCursor = {
				emittedAt: new Date(decoded.emittedAt),
				deviceId: decoded.deviceId,
				eventId: decoded.eventId,
			};
		}

		const { pageSize: PAGE_SIZE, maxTotalRows: MAX_TOTAL_ROWS } = getExportConfig(c.env);

		// Content type is part of the contract; set before constructing the Response.
		c.header('Content-Type', 'application/x-ndjson');

		// Determine truncation + continuation cursor up-front so headers/status are actually sent.
		// Keep the NDJSON body "raw events only" (one event per line) per ADR 0022.
		try {
			const probeWhere = buildExportCursorWhere({ userId, fromMs, toMs, cursor: initialCursor });
			const probe = await db
				.select({ emittedAt: eventTable.emittedAt, deviceId: eventTable.deviceId, eventId: eventTable.eventId })
				.from(eventTable)
				.where(probeWhere)
				.orderBy(eventTable.emittedAt, eventTable.deviceId, eventTable.eventId)
				.limit(2)
				.offset(MAX_TOTAL_ROWS - 1);

			const lastIncluded = probe[0];
			const hasMore = probe.length === 2;

			if (hasMore && lastIncluded) {
				c.header('X-Export-Truncated', 'true');
				c.header('X-Export-Cursor', encodeCursor(lastIncluded.emittedAt.getTime(), lastIncluded.deviceId, lastIncluded.eventId));
				// "Partial Content" is a useful signal for clients even if they ignore headers.
				c.status(206);
			}
		} catch (e) {
			// If we can't safely determine truncation up-front, fail loudly instead of streaming a misleading response.
			console.error('Export truncation probe failed:', e);
			return apiError(c, 500, 'INTERNAL_ERROR', 'Failed to start export');
		}

		return stream(c, async (s) => {
			let aborted = false;
			const abortListener = () => {
				aborted = true;
				s.abort();
			};

			try {
				c.req.raw.signal.addEventListener('abort', abortListener, { once: true });
			} catch {
				// Ignore if the runtime doesn't support AbortSignal listeners.
			}

			s.onAbort(() => {
				aborted = true;
			});

			let cursor: { emittedAt: Date; deviceId: string; eventId: string } | null = initialCursor;
			let totalExported = 0;

			try {
				while (!aborted && totalExported < MAX_TOTAL_ROWS) {
					const remainingCapacity = MAX_TOTAL_ROWS - totalExported;
					const limit = Math.min(PAGE_SIZE, remainingCapacity);
					const cursorWhere = buildExportCursorWhere({ userId, fromMs, toMs, cursor });

					const rows: EventRow[] = await db
						.select()
						.from(eventTable)
						.where(cursorWhere)
						.orderBy(eventTable.emittedAt, eventTable.deviceId, eventTable.eventId)
						.limit(limit);

					if (rows.length === 0 || aborted) break;

					for (const row of rows) {
						if (aborted) break;
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

						await s.write(JSON.stringify(envelope) + '\n');
						totalExported += 1;
						cursor = { emittedAt: row.emittedAt, deviceId: row.deviceId, eventId: row.eventId };
					}

					// If the DB returned fewer rows than requested, we've reached the end.
					if (rows.length < limit) break;
				}
			} catch (error) {
				// Don't write non-event lines into the NDJSON stream; keep it "raw events only".
				// If anything fails mid-export, abort the stream so callers don't treat a partial body as complete.
				console.error('Export stream failed:', error);
				s.abort();
				throw error;
			} finally {
				try {
					c.req.raw.signal.removeEventListener('abort', abortListener);
				} catch {
					// ignore
				}
			}
		});
	});
