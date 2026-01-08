/**
 * Event ingest routes (events-first telemetry MVP).
 *
 * POST /events/ingest - ingest append-only telemetry events (idempotent)
 */

import { Hono } from 'hono';
import * as v from 'valibot';
import { device as deviceTable, event as eventTable } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
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

	const statements: D1PreparedStatement[] = [];

	for (const deviceId of uniqueDeviceIds) {
		const stmt = db
			.insert(deviceTable)
			.values({
				id: deviceId,
				userId,
				type: 'unknown',
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

	for (const e of validEvents) {
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

	await rawDb.batch(statements);

	return c.json({
		accepted: events.length - rejected.length,
		rejected,
		server_time_ms: serverTimeMs,
	});
});
