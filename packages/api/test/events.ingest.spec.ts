import { env, SELF } from 'cloudflare:test';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { device, event, schema } from '../src/db';
import { generateUUID, getAuthCookieAndUserId } from './helpers';
import { applyMigrations } from './setup';

let authCookie: string;
let testUserId: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
	const auth = await getAuthCookieAndUserId();
	authCookie = auth.cookie;
	testUserId = auth.userId;
});

afterEach(async () => {
	// Clean up test data after each test (order matters for FK constraints)
	await db.delete(event);
	await db.delete(device);
	// Note: CF rate limiter state is managed by the binding, no manual cleanup needed
});

function heartbeatEvent(opts: { deviceId: string; eventId: string; emittedAtMs: number }) {
	return {
		schema_version: 1,
		event_id: opts.eventId,
		device_id: opts.deviceId,
		emitted_at: opts.emittedAtMs,
		type: 'artifact_active',
		artifact: { url_hash: 'hash', host: 'example.com', path_hint: '/docs' },
		payload: {
			interval_ms: 30_000,
			active_signals: { window_focused: true, tab_active: true, user_idle: false },
		},
	};
}

describe('POST /events/ingest', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ events: [] }),
		});

		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('ingests valid events and stores them append-only', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const res = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [
					heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - 30_000 }),
					heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now }),
				],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.validated).toBe(2);
		expect(body.rejected).toEqual([]);
		expect(typeof body.server_time_ms).toBe('number');

		const [row] = await db.select({ count: count() }).from(event).where(eq(event.userId, testUserId));
		expect(row?.count).toBe(2);
	});

	it('accepts the valid subset and rejects invalid events with per-event reasons', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		const res = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [
					heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now }),
					{ schema_version: 1, event_id: generateUUID(), device_id: deviceId, emitted_at: now, type: 'nope', payload: {} },
				],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.validated).toBe(1);
		expect(body.rejected).toHaveLength(1);
		expect(body.rejected[0].index).toBe(1);
		expect(typeof body.rejected[0].reason).toBe('string');

		const [row] = await db.select({ count: count() }).from(event).where(eq(event.userId, testUserId));
		expect(row?.count).toBe(1);
	});

	it('is idempotent for duplicate events (dedupe on user/device/event_id)', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const eventId = generateUUID();

		const res = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [heartbeatEvent({ deviceId, eventId, emittedAtMs: now }), heartbeatEvent({ deviceId, eventId, emittedAtMs: now })],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.validated).toBe(2);
		expect(body.rejected).toEqual([]);

		const [row] = await db.select({ count: count() }).from(event).where(eq(event.userId, testUserId));
		expect(row?.count).toBe(1);
	});

	it('creates device with type "chrome_extension"', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		const res = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now })],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.validated).toBe(1);

		const [deviceRow] = await db.select().from(device).where(eq(device.id, deviceId));
		expect(deviceRow?.type).toBe('chrome_extension');
		expect(deviceRow?.userId).toBe(testUserId);
	});

	it('handles maximum batch size (exactly 500 events)', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const batchSize = 500;

		const events = Array.from({ length: batchSize }, (_, i) =>
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now + i * 1000 })
		);

		const res = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ events }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.validated).toBe(batchSize);
		expect(body.rejected).toEqual([]);

		const [row] = await db.select({ count: count() }).from(event).where(eq(event.userId, testUserId));
		expect(row?.count).toBe(batchSize);
	});

	it('rejects batches exceeding 500 events', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const batchSize = 501;

		const events = Array.from({ length: batchSize }, (_, i) =>
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now + i * 1000 })
		);

		const res = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ events }),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('events must be <= 500');
	});

	// Skip: CF rate limiter state persists across test runs, making isolated rate limit
	// testing impractical. Rate limiting is verified via manual/integration testing.
	// The rate limiter uses CF's distributed Rate Limiting API (see wrangler.jsonc).
	it.skip('enforces rate limit (batch-based)', async () => {
		// CF rate limiting is batch-based (100 batches/min in prod).
		// Each limit() call = 1 batch, regardless of event count.
	});

	it('rejects events from devices owned by other users', async () => {
		// Setup: Create a second user with a different email
		const secondAuth = await getAuthCookieAndUserId('test+b@example.com', 'test-password-123', 'Test User B');
		const secondUserCookie = secondAuth.cookie;
		const secondUserId = secondAuth.userId;

		const deviceId = generateUUID();
		const now = Date.now();

		// First user creates a device by sending an event
		const res1 = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now })],
			}),
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;
		expect(body1.validated).toBe(1);

		// Verify device is owned by first user
		const [deviceRow] = await db.select().from(device).where(eq(device.id, deviceId));
		expect(deviceRow?.userId).toBe(testUserId);

		// Second user attempts to send events with first user's device ID
		const maliciousEventId = generateUUID();
		const res2 = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: secondUserCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [heartbeatEvent({ deviceId, eventId: maliciousEventId, emittedAtMs: now + 1000 })],
			}),
		});

		// The request should succeed but reject the event
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;
		expect(body2.validated).toBe(0);
		expect(body2.rejected).toHaveLength(1);
		expect(body2.rejected[0].event_id).toBe(maliciousEventId);
		expect(body2.rejected[0].reason).toBe('Device belongs to another user');

		// Verify no event was created for the second user with this device
		const [eventCount] = await db.select({ count: count() }).from(event).where(eq(event.userId, secondUserId));
		expect(eventCount?.count).toBe(0);

		// Verify device ownership didn't change
		const [deviceRowAfter] = await db.select().from(device).where(eq(device.id, deviceId));
		expect(deviceRowAfter?.userId).toBe(testUserId);

		// Verify total events for first user is still 1
		const [firstUserEvents] = await db.select({ count: count() }).from(event).where(eq(event.userId, testUserId));
		expect(firstUserEvents?.count).toBe(1);
	});

	it('accepts events for new devices while rejecting events for foreign devices in the same batch', async () => {
		// Setup: Create a second user with a different email
		const secondAuth = await getAuthCookieAndUserId('test+c@example.com', 'test-password-123', 'Test User C');
		const secondUserCookie = secondAuth.cookie;
		const secondUserId = secondAuth.userId;

		const foreignDeviceId = generateUUID();
		const ownDeviceId = generateUUID();
		const now = Date.now();

		// First user creates a device
		const res1 = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [heartbeatEvent({ deviceId: foreignDeviceId, eventId: generateUUID(), emittedAtMs: now })],
			}),
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;
		expect(body1.validated).toBe(1);

		// Second user sends a batch with both a foreign device and their own new device
		const foreignEventId = generateUUID();
		const ownEventId = generateUUID();
		const res2 = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { cookie: secondUserCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				events: [
					heartbeatEvent({ deviceId: foreignDeviceId, eventId: foreignEventId, emittedAtMs: now + 1000 }),
					heartbeatEvent({ deviceId: ownDeviceId, eventId: ownEventId, emittedAtMs: now + 2000 }),
				],
			}),
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;
		expect(body2.validated).toBe(1);
		expect(body2.rejected).toHaveLength(1);
		expect(body2.rejected[0].event_id).toBe(foreignEventId);
		expect(body2.rejected[0].reason).toBe('Device belongs to another user');

		// Verify second user has exactly 1 event (their own device)
		const [secondUserEvents] = await db.select({ count: count() }).from(event).where(eq(event.userId, secondUserId));
		expect(secondUserEvents?.count).toBe(1);

		// Verify the validated event is for the own device
		const [acceptedEvent] = await db.select().from(event).where(eq(event.userId, secondUserId));
		expect(acceptedEvent?.deviceId).toBe(ownDeviceId);
		expect(acceptedEvent?.eventId).toBe(ownEventId);

		// Verify own device was created with correct ownership
		const [ownDeviceRow] = await db.select().from(device).where(eq(device.id, ownDeviceId));
		expect(ownDeviceRow?.userId).toBe(secondUserId);
	});
});
