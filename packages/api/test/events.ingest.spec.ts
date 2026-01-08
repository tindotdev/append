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
		expect(body.accepted).toBe(2);
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
		expect(body.accepted).toBe(1);
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
		expect(body.accepted).toBe(2);
		expect(body.rejected).toEqual([]);

		const [row] = await db.select({ count: count() }).from(event).where(eq(event.userId, testUserId));
		expect(row?.count).toBe(1);
	});
});
