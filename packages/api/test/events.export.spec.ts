import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { device, event, schema } from '../src/db';
import { authFetch, generateUUID, getAuthCookieAndUserId } from './helpers';
import { applyMigrations } from './setup';

let authCookie: string;
let authCookieB: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
	const authA = await getAuthCookieAndUserId('test+a@example.com', 'test-password-123', 'Test User A');
	authCookie = authA.cookie;

	// Create second user for data isolation tests
	const authB = await getAuthCookieAndUserId('test+export@example.com', 'test-password-123', 'Test User Export');
	authCookieB = authB.cookie;
});

afterEach(async () => {
	await db.delete(event);
	await db.delete(device);
});

/**
 * Generate a heartbeat event for testing.
 */
function heartbeatEvent(opts: {
	deviceId: string;
	eventId: string;
	emittedAtMs: number;
	host?: string;
	urlHash?: string;
	pathHint?: string;
}) {
	return {
		schema_version: 1,
		event_id: opts.eventId,
		device_id: opts.deviceId,
		emitted_at: opts.emittedAtMs,
		type: 'artifact_active',
		artifact: {
			url_hash: opts.urlHash ?? 'test-hash',
			host: opts.host ?? 'docs.example.com',
			path_hint: opts.pathHint ?? '/docs',
		},
		payload: {
			interval_ms: 30_000,
			active_signals: {
				window_focused: true,
				tab_active: true,
				user_idle: false,
			},
		},
	};
}

/**
 * Helper to ingest events via the API.
 */
async function ingestEvents(cookie: string, events: unknown[]) {
	const res = await SELF.fetch('https://example.com/events/ingest', {
		method: 'POST',
		headers: { cookie, 'content-type': 'application/json' },
		body: JSON.stringify({ events }),
	});
	expect(res.status).toBe(200);
	return res.json();
}

/**
 * Parse NDJSON response body.
 */
async function parseNdjson(res: Response): Promise<unknown[]> {
	const text = await res.text();
	if (!text.trim()) return [];
	return text
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line));
}

describe('GET /events/export', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/events/export?from=2026-01-01&to=2026-01-31&format=ndjson');
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing from parameter', async () => {
		const res = await authFetch('/events/export?to=2026-01-31&format=ndjson', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for missing to parameter', async () => {
		const res = await authFetch('/events/export?from=2026-01-01&format=ndjson', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for missing format parameter', async () => {
		const res = await authFetch('/events/export?from=2026-01-01&to=2026-01-31', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for invalid date format', async () => {
		const res = await authFetch('/events/export?from=not-a-date&to=2026-01-31&format=ndjson', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for impossible calendar dates (regression: 2026-02-30)', async () => {
		// Feb 30 doesn't exist - should reject, not normalize to Mar 2
		const res = await authFetch('/events/export?from=2026-02-30&to=2026-03-01&format=ndjson', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('Invalid date');
	});

	it('returns 400 for invalid month (2026-13-01)', async () => {
		const res = await authFetch('/events/export?from=2026-13-01&to=2026-13-31&format=ndjson', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 when from is after to', async () => {
		const res = await authFetch('/events/export?from=2026-01-31&to=2026-01-01&format=ndjson', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for unsupported format', async () => {
		const res = await authFetch('/events/export?from=2026-01-01&to=2026-01-31&format=csv', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns empty response when no events exist', async () => {
		const res = await authFetch('/events/export?from=2026-01-01&to=2026-01-31&format=ndjson', { cookie: authCookie });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/x-ndjson');

		const events = await parseNdjson(res);
		expect(events).toHaveLength(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Export filtering
	// ─────────────────────────────────────────────────────────────────────────

	it('filters events by date range (inclusive)', async () => {
		const deviceId = generateUUID();

		// Events on different dates
		const jan5 = Date.UTC(2026, 0, 5, 12, 0, 0);
		const jan10 = Date.UTC(2026, 0, 10, 12, 0, 0);
		const jan15 = Date.UTC(2026, 0, 15, 12, 0, 0);

		const eventIdJan5 = generateUUID();
		const eventIdJan10 = generateUUID();
		const eventIdJan15 = generateUUID();

		await ingestEvents(authCookie, [
			heartbeatEvent({ deviceId, eventId: eventIdJan5, emittedAtMs: jan5 }),
			heartbeatEvent({ deviceId, eventId: eventIdJan10, emittedAtMs: jan10 }),
			heartbeatEvent({ deviceId, eventId: eventIdJan15, emittedAtMs: jan15 }),
		]);

		// Export only Jan 5-10 (should exclude Jan 15)
		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-10&format=ndjson', { cookie: authCookie });
		const events = await parseNdjson(res);

		expect(events).toHaveLength(2);
		const eventIds = events.map((e: any) => e.event_id);
		expect(eventIds).toContain(eventIdJan5);
		expect(eventIds).toContain(eventIdJan10);
		expect(eventIds).not.toContain(eventIdJan15);
	});

	it('includes events at exact date boundaries', async () => {
		const deviceId = generateUUID();

		// Events at start and end of Jan 5 UTC
		const jan5Start = Date.UTC(2026, 0, 5, 0, 0, 0);
		const jan5End = Date.UTC(2026, 0, 5, 23, 59, 59);

		const eventIdStart = generateUUID();
		const eventIdEnd = generateUUID();

		await ingestEvents(authCookie, [
			heartbeatEvent({ deviceId, eventId: eventIdStart, emittedAtMs: jan5Start }),
			heartbeatEvent({ deviceId, eventId: eventIdEnd, emittedAtMs: jan5End }),
		]);

		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const events = await parseNdjson(res);

		expect(events).toHaveLength(2);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Export ordering
	// ─────────────────────────────────────────────────────────────────────────

	it('returns events ordered by (emitted_at, device_id, event_id)', async () => {
		const deviceIdA = generateUUID();
		const deviceIdB = generateUUID();

		// Events at the same timestamp but different devices
		const time = Date.UTC(2026, 0, 5, 12, 0, 0);
		const time2 = Date.UTC(2026, 0, 5, 12, 0, 1);

		await ingestEvents(authCookie, [
			heartbeatEvent({ deviceId: deviceIdB, eventId: generateUUID(), emittedAtMs: time }),
			heartbeatEvent({ deviceId: deviceIdA, eventId: generateUUID(), emittedAtMs: time }),
			heartbeatEvent({ deviceId: deviceIdA, eventId: generateUUID(), emittedAtMs: time2 }),
		]);

		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const events = (await parseNdjson(res)) as any[];

		expect(events).toHaveLength(3);

		// Events should be sorted by emitted_at first
		for (let i = 1; i < events.length; i++) {
			const prev = events[i - 1];
			const curr = events[i];

			if (prev.emitted_at === curr.emitted_at) {
				// Same timestamp: should be sorted by device_id
				if (prev.device_id === curr.device_id) {
					// Same device: should be sorted by event_id
					expect(prev.event_id <= curr.event_id).toBe(true);
				} else {
					expect(prev.device_id <= curr.device_id).toBe(true);
				}
			} else {
				expect(prev.emitted_at <= curr.emitted_at).toBe(true);
			}
		}
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Data isolation (never leak other user data)
	// ─────────────────────────────────────────────────────────────────────────

	it('does not leak events from other users', async () => {
		const deviceIdA = generateUUID();
		const deviceIdB = generateUUID();
		const time = Date.UTC(2026, 0, 5, 12, 0, 0);

		const eventIdA = generateUUID();
		const eventIdB = generateUUID();

		// User A creates an event
		await ingestEvents(authCookie, [heartbeatEvent({ deviceId: deviceIdA, eventId: eventIdA, emittedAtMs: time })]);

		// User B creates an event
		await ingestEvents(authCookieB, [heartbeatEvent({ deviceId: deviceIdB, eventId: eventIdB, emittedAtMs: time })]);

		// User A exports - should only see their own event
		const resA = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const eventsA = (await parseNdjson(resA)) as any[];

		expect(eventsA).toHaveLength(1);
		expect(eventsA[0].event_id).toBe(eventIdA);
		expect(eventsA[0].device_id).toBe(deviceIdA);

		// User B exports - should only see their own event
		const resB = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookieB });
		const eventsB = (await parseNdjson(resB)) as any[];

		expect(eventsB).toHaveLength(1);
		expect(eventsB[0].event_id).toBe(eventIdB);
		expect(eventsB[0].device_id).toBe(deviceIdB);
	});

	it('does not include user_id in exported events', async () => {
		const deviceId = generateUUID();
		const time = Date.UTC(2026, 0, 5, 12, 0, 0);

		await ingestEvents(authCookie, [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: time })]);

		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const events = (await parseNdjson(res)) as any[];

		expect(events).toHaveLength(1);
		expect(events[0]).not.toHaveProperty('user_id');
		expect(events[0]).not.toHaveProperty('userId');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Event envelope structure
	// ─────────────────────────────────────────────────────────────────────────

	it('exports events with correct envelope structure', async () => {
		const deviceId = generateUUID();
		const eventId = generateUUID();
		const time = Date.UTC(2026, 0, 5, 12, 0, 0);

		await ingestEvents(authCookie, [
			heartbeatEvent({ deviceId, eventId, emittedAtMs: time, host: 'react.dev', urlHash: 'abc123', pathHint: '/learn' }),
		]);

		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const events = (await parseNdjson(res)) as any[];

		expect(events).toHaveLength(1);
		const evt = events[0];

		// Required fields
		expect(evt.schema_version).toBe(1);
		expect(evt.event_id).toBe(eventId);
		expect(evt.device_id).toBe(deviceId);
		expect(evt.emitted_at).toBe(time);
		expect(evt.type).toBe('artifact_active');
		expect(typeof evt.received_at).toBe('number');

		// Artifact
		expect(evt.artifact).toBeDefined();
		expect(evt.artifact.host).toBe('react.dev');
		expect(evt.artifact.url_hash).toBe('abc123');
		expect(evt.artifact.path_hint).toBe('/learn');

		// Payload
		expect(evt.payload).toBeDefined();
		expect(evt.payload.interval_ms).toBe(30_000);
		expect(evt.payload.active_signals).toBeDefined();
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Content-Type
	// ─────────────────────────────────────────────────────────────────────────

	it('returns application/x-ndjson content type', async () => {
		const res = await authFetch('/events/export?from=2026-01-01&to=2026-01-31&format=ndjson', { cookie: authCookie });
		expect(res.headers.get('content-type')).toBe('application/x-ndjson');
		// Consume the body to prevent streaming cleanup issues
		await res.text();
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Pagination (large datasets)
	// ─────────────────────────────────────────────────────────────────────────

	it('handles pagination for large result sets', async () => {
		const deviceId = generateUUID();
		const baseTime = Date.UTC(2026, 0, 5, 12, 0, 0);

		// Create 50 events
		const events = [];
		for (let i = 0; i < 50; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: baseTime + i * 1000,
				})
			);
		}

		await ingestEvents(authCookie, events);

		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const exportedEvents = await parseNdjson(res);

		// All events should be exported
		expect(exportedEvents).toHaveLength(50);

		// Verify ordering
		const timestamps = exportedEvents.map((e: any) => e.emitted_at);
		for (let i = 1; i < timestamps.length; i++) {
			expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
		}
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Truncation header behavior
	// ─────────────────────────────────────────────────────────────────────────
	//
	// NOTE: In the test environment, EVENTS_EXPORT_MAX_TOTAL_ROWS is set to a small
	// value (see vitest.config.mts) so we can cover truncation without inserting 100k+ rows.
	// ─────────────────────────────────────────────────────────────────────────

	it('does not set X-Export-Truncated header when all data is exported', async () => {
		const deviceId = generateUUID();
		const baseTime = Date.UTC(2026, 0, 5, 12, 0, 0);

		// Create a moderate number of events (well under the 100k limit)
		const events = [];
		for (let i = 0; i < 100; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: baseTime + i * 1000,
				})
			);
		}

		await ingestEvents(authCookie, events);

		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });

		// All events should be exported
		const exportedEvents = await parseNdjson(res);
		expect(exportedEvents).toHaveLength(100);

		// Truncation header should NOT be set since all data was exported
		expect(res.headers.get('X-Export-Truncated')).toBeNull();
	});

	it('sets X-Export-Truncated and X-Export-Cursor when export exceeds max rows', async () => {
		const maxTotalRows = Number(env.EVENTS_EXPORT_MAX_TOTAL_ROWS ?? 100_000);
		expect(maxTotalRows).toBeGreaterThan(0);

		const totalEvents = maxTotalRows + 50;
		const deviceId = generateUUID();
		const baseTime = Date.UTC(2026, 0, 5, 12, 0, 0);

		// Ingest events in batches (ingest endpoint caps at 500 events per request)
		const BATCH_SIZE = 500;
		for (let offset = 0; offset < totalEvents; offset += BATCH_SIZE) {
			const batchSize = Math.min(BATCH_SIZE, totalEvents - offset);
			const batch = [];
			for (let i = 0; i < batchSize; i++) {
				const eventIndex = offset + i;
				batch.push(
					heartbeatEvent({
						deviceId,
						eventId: generateUUID(),
						emittedAtMs: baseTime + eventIndex * 1000,
					})
				);
			}
			await ingestEvents(authCookie, batch);
		}

		const res1 = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		expect(res1.status).toBe(206);
		expect(res1.headers.get('X-Export-Truncated')).toBe('true');
		const cursor = res1.headers.get('X-Export-Cursor');
		expect(cursor).toBeTruthy();

		const exported1 = (await parseNdjson(res1)) as any[];
		expect(exported1).toHaveLength(maxTotalRows);

		const res2 = await authFetch(`/events/export?from=2026-01-05&to=2026-01-05&format=ndjson&cursor=${cursor}`, { cookie: authCookie });
		expect(res2.status).toBe(200);
		expect(res2.headers.get('X-Export-Truncated')).toBeNull();

		const exported2 = (await parseNdjson(res2)) as any[];
		expect(exported2).toHaveLength(totalEvents - maxTotalRows);
	});

	it('does not set X-Export-Truncated header when result size equals PAGE_SIZE exactly', async () => {
		// Ensure we don't falsely mark an export as truncated when the result size
		// happens to exactly match the paging size.
		//
		// PAGE_SIZE in routes.ts defaults to 1000, so we create exactly 1000 events.
		// We must batch ingests because the API limits batches to 500 events.
		const deviceId = generateUUID();
		const baseTime = Date.UTC(2026, 0, 5, 12, 0, 0);

		const PAGE_SIZE = 1000;
		const BATCH_SIZE = 500;

		// Ingest events in batches
		for (let batch = 0; batch < PAGE_SIZE / BATCH_SIZE; batch++) {
			const events = [];
			for (let i = 0; i < BATCH_SIZE; i++) {
				const eventIndex = batch * BATCH_SIZE + i;
				events.push(
					heartbeatEvent({
						deviceId,
						eventId: generateUUID(),
						emittedAtMs: baseTime + eventIndex * 1000,
					})
				);
			}
			await ingestEvents(authCookie, events);
		}

		const res = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });

		// All events should be exported
		const exportedEvents = await parseNdjson(res);
		expect(exportedEvents).toHaveLength(PAGE_SIZE);

		// Truncation header should NOT be set since all data was exported
		// (even though the result count equals PAGE_SIZE)
		expect(res.headers.get('X-Export-Truncated')).toBeNull();
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Cursor continuation support
	// ─────────────────────────────────────────────────────────────────────────

	it('returns 400 for invalid cursor format', async () => {
		const res = await authFetch('/events/export?from=2026-01-01&to=2026-01-31&format=ndjson&cursor=invalid', {
			cookie: authCookie,
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('Invalid cursor');
	});

	it('resumes export from cursor position', async () => {
		const deviceId = generateUUID();
		const baseTime = Date.UTC(2026, 0, 5, 12, 0, 0);

		// Create 5 events with distinct timestamps
		const eventIds: string[] = [];
		const events = [];
		for (let i = 0; i < 5; i++) {
			const eventId = generateUUID();
			eventIds.push(eventId);
			events.push(
				heartbeatEvent({
					deviceId,
					eventId,
					emittedAtMs: baseTime + i * 1000,
				})
			);
		}
		await ingestEvents(authCookie, events);

		// First export without cursor - get all 5 events
		const res1 = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const events1 = (await parseNdjson(res1)) as any[];
		expect(events1).toHaveLength(5);

		// Create a cursor pointing to the 2nd event (index 1)
		// Events after this cursor should be events 3, 4, 5 (indices 2, 3, 4)
		const secondEvent = events1[1];
		const cursorData = {
			emittedAt: secondEvent.emitted_at,
			deviceId: secondEvent.device_id,
			eventId: secondEvent.event_id,
		};
		const cursor = btoa(JSON.stringify(cursorData)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

		// Export with cursor - should get events after the 2nd one
		const res2 = await authFetch(`/events/export?from=2026-01-05&to=2026-01-05&format=ndjson&cursor=${cursor}`, {
			cookie: authCookie,
		});
		const events2 = (await parseNdjson(res2)) as any[];

		// Should get the last 3 events (indices 2, 3, 4)
		expect(events2).toHaveLength(3);
		expect(events2[0].event_id).toBe(eventIds[2]);
		expect(events2[1].event_id).toBe(eventIds[3]);
		expect(events2[2].event_id).toBe(eventIds[4]);
	});

	it('returns empty result when cursor is at the last event', async () => {
		const deviceId = generateUUID();
		const eventId = generateUUID();
		const baseTime = Date.UTC(2026, 0, 5, 12, 0, 0);

		await ingestEvents(authCookie, [heartbeatEvent({ deviceId, eventId, emittedAtMs: baseTime })]);

		// Export to get the event
		const res1 = await authFetch('/events/export?from=2026-01-05&to=2026-01-05&format=ndjson', { cookie: authCookie });
		const events1 = (await parseNdjson(res1)) as any[];
		expect(events1).toHaveLength(1);

		// Create cursor at the last event
		const lastEvent = events1[0];
		const cursorData = {
			emittedAt: lastEvent.emitted_at,
			deviceId: lastEvent.device_id,
			eventId: lastEvent.event_id,
		};
		const cursor = btoa(JSON.stringify(cursorData)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

		// Export with cursor - should get no events
		const res2 = await authFetch(`/events/export?from=2026-01-05&to=2026-01-05&format=ndjson&cursor=${cursor}`, {
			cookie: authCookie,
		});
		const events2 = await parseNdjson(res2);
		expect(events2).toHaveLength(0);
	});
});
