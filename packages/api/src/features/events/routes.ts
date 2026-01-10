/**
 * Event ingest routes (events-first telemetry MVP).
 *
 * POST /events/ingest - ingest append-only telemetry events (idempotent)
 */

import { inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import * as v from 'valibot';
import { device as deviceTable, event as eventTable } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
import { checkRateLimit } from '../../shared/rate-limit';
import { IngestEventsRequestSchema, type TelemetryEventInput, TelemetryEventSchema } from './validation/events.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function firstIssueMessage(issues: v.BaseIssue<unknown>[] | undefined): string {
	return issues?.[0]?.message ?? 'Validation failed';
}

export const eventsRoutes = app.post('/ingest', async (c) => {
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
		return c.json({ accepted: 0, rejected, server_time_ms: serverTimeMs });
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
		return c.json({ accepted: 0, rejected, server_time_ms: serverTimeMs });
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
		accepted: events.length - rejected.length,
		inserted,
		rejected,
		server_time_ms: serverTimeMs,
	});
});
