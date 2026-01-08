import { env, SELF } from 'cloudflare:test';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { device, deviceToken, event, schema } from '../src/db';
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
	await db.delete(event);
	await db.delete(device);
	await db.delete(deviceToken);
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

describe('Device tokens', () => {
	it('mints a device token and can ingest via Authorization: Bearer', async () => {
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'dev extension' }),
		});

		expect(mintRes.status).toBe(200);
		const mintBody = (await mintRes.json()) as any;
		expect(typeof mintBody.token).toBe('string');
		expect(typeof mintBody.token_id).toBe('string');

		const deviceId = generateUUID();
		const now = Date.now();
		const ingestRes = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${mintBody.token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now })] }),
		});

		expect(ingestRes.status).toBe(200);
		const ingestBody = (await ingestRes.json()) as any;
		expect(ingestBody.accepted).toBe(1);
		expect(ingestBody.rejected).toEqual([]);

		const [row] = await db.select({ count: count() }).from(event).where(eq(event.userId, testUserId));
		expect(row?.count).toBe(1);
	});

	it('revoked tokens are rejected', async () => {
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({}),
		});
		const mintBody = (await mintRes.json()) as any;

		const revokeRes = await SELF.fetch(`https://example.com/api/device-tokens/${mintBody.token_id}`, {
			method: 'DELETE',
			headers: { cookie: authCookie },
		});
		expect(revokeRes.status).toBe(204);

		const deviceId = generateUUID();
		const now = Date.now();
		const ingestRes = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${mintBody.token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now })] }),
		});

		expect(ingestRes.status).toBe(401);
	});
});
