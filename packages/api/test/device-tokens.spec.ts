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
		expect(ingestBody.validated).toBe(1);
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

	it('updates last_used_at when token is used for authentication', async () => {
		// Mint a new token
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'test token' }),
		});
		const mintBody = (await mintRes.json()) as any;
		const tokenId = mintBody.token_id;
		const token = mintBody.token;

		// Verify initial state: last_used_at should be null
		const [initialRow] = await db.select().from(deviceToken).where(eq(deviceToken.id, tokenId));
		expect(initialRow).toBeDefined();
		expect(initialRow.lastUsedAt).toBeNull();

		// Use the token for authentication
		const beforeUse = Date.now();
		const deviceId = generateUUID();
		const ingestRes = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: beforeUse })] }),
		});
		const afterUse = Date.now();
		expect(ingestRes.status).toBe(200);

		// Verify last_used_at was updated
		const [updatedRow] = await db.select().from(deviceToken).where(eq(deviceToken.id, tokenId));
		expect(updatedRow.lastUsedAt).not.toBeNull();
		const lastUsedMs = updatedRow.lastUsedAt!.getTime();
		expect(lastUsedMs).toBeGreaterThanOrEqual(beforeUse);
		expect(lastUsedMs).toBeLessThanOrEqual(afterUse);
	});

	it('returns last_used_at_ms in GET /api/device-tokens after token usage', async () => {
		// Mint a new token
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'api test token' }),
		});
		const mintBody = (await mintRes.json()) as any;
		const tokenId = mintBody.token_id;
		const token = mintBody.token;

		// List tokens before usage - last_used_at_ms should be null
		const listBefore = await SELF.fetch('https://example.com/api/device-tokens', {
			headers: { cookie: authCookie },
		});
		const listBeforeBody = (await listBefore.json()) as any;
		const tokenBefore = listBeforeBody.tokens.find((t: any) => t.id === tokenId);
		expect(tokenBefore).toBeDefined();
		expect(tokenBefore.last_used_at_ms).toBeNull();

		// Use the token
		const beforeUse = Date.now();
		const deviceId = generateUUID();
		const ingestRes = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: beforeUse })] }),
		});
		const afterUse = Date.now();
		expect(ingestRes.status).toBe(200);

		// List tokens after usage - last_used_at_ms should be populated
		const listAfter = await SELF.fetch('https://example.com/api/device-tokens', {
			headers: { cookie: authCookie },
		});
		const listAfterBody = (await listAfter.json()) as any;
		const tokenAfter = listAfterBody.tokens.find((t: any) => t.id === tokenId);
		expect(tokenAfter).toBeDefined();
		expect(tokenAfter.last_used_at_ms).not.toBeNull();
		expect(tokenAfter.last_used_at_ms).toBeGreaterThanOrEqual(beforeUse);
		expect(tokenAfter.last_used_at_ms).toBeLessThanOrEqual(afterUse);
	});

	it('updates last_used_at on subsequent token uses', async () => {
		// Mint a token and use it once
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'reuse test' }),
		});
		const mintBody = (await mintRes.json()) as any;
		const tokenId = mintBody.token_id;
		const token = mintBody.token;

		// First use
		const deviceId = generateUUID();
		await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: Date.now() })] }),
		});

		const [firstUseRow] = await db.select().from(deviceToken).where(eq(deviceToken.id, tokenId));
		const firstUseTime = firstUseRow.lastUsedAt!.getTime();

		// Wait a bit to ensure timestamp will be different
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Second use
		const beforeSecondUse = Date.now();
		await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: Date.now() })] }),
		});
		const afterSecondUse = Date.now();

		// Verify last_used_at was updated to a later time
		const [secondUseRow] = await db.select().from(deviceToken).where(eq(deviceToken.id, tokenId));
		const secondUseTime = secondUseRow.lastUsedAt!.getTime();
		expect(secondUseTime).toBeGreaterThan(firstUseTime);
		expect(secondUseTime).toBeGreaterThanOrEqual(beforeSecondUse);
		expect(secondUseTime).toBeLessThanOrEqual(afterSecondUse);
	});

	it('can create a token with expiration and returns expires_at_ms', async () => {
		const expiresInDays = 30;
		const beforeMint = Date.now();
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'expiring token', expires_in_days: expiresInDays }),
		});
		const afterMint = Date.now();

		expect(mintRes.status).toBe(200);
		const mintBody = (await mintRes.json()) as any;
		expect(typeof mintBody.token).toBe('string');
		expect(typeof mintBody.expires_at_ms).toBe('number');

		// Verify expiration is approximately 30 days from now
		const expectedExpiration = beforeMint + expiresInDays * 24 * 60 * 60 * 1000;
		const actualExpiration = mintBody.expires_at_ms;
		expect(actualExpiration).toBeGreaterThanOrEqual(expectedExpiration);
		expect(actualExpiration).toBeLessThanOrEqual(expectedExpiration + (afterMint - beforeMint));
	});

	it('tokens without expiration have null expires_at_ms', async () => {
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'never expires' }),
		});

		expect(mintRes.status).toBe(200);
		const mintBody = (await mintRes.json()) as any;
		expect(mintBody.expires_at_ms).toBeNull();
	});

	it('expired tokens are rejected with 401', async () => {
		// Create a token that expires in 1 day
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'soon to expire', expires_in_days: 1 }),
		});
		const mintBody = (await mintRes.json()) as any;
		const tokenId = mintBody.token_id;
		const token = mintBody.token;

		// Manually set the expiration to the past by updating the database
		const pastExpiration = new Date(Date.now() - 1000); // 1 second ago
		await db.update(deviceToken).set({ expiresAt: pastExpiration }).where(eq(deviceToken.id, tokenId));

		// Try to use the expired token
		const deviceId = generateUUID();
		const ingestRes = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: Date.now() })] }),
		});

		expect(ingestRes.status).toBe(401);
		const errorBody = (await ingestRes.json()) as any;
		expect(errorBody.error.code).toBe('UNAUTHORIZED');
		expect(errorBody.error.message).toBe('Token expired');
	});

	it('non-expired tokens work normally', async () => {
		// Create a token that expires in 30 days
		const mintRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'valid token', expires_in_days: 30 }),
		});
		const mintBody = (await mintRes.json()) as any;
		const token = mintBody.token;

		// Use the token - should work fine
		const deviceId = generateUUID();
		const ingestRes = await SELF.fetch('https://example.com/events/ingest', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ events: [heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: Date.now() })] }),
		});

		expect(ingestRes.status).toBe(200);
		const ingestBody = (await ingestRes.json()) as any;
		expect(ingestBody.validated).toBe(1);
	});

	it('GET /api/device-tokens includes expires_at_ms', async () => {
		// Create two tokens: one with expiration, one without
		await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'expires in 90 days', expires_in_days: 90 }),
		});

		await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'never expires' }),
		});

		// List tokens
		const listRes = await SELF.fetch('https://example.com/api/device-tokens', {
			headers: { cookie: authCookie },
		});

		expect(listRes.status).toBe(200);
		const listBody = (await listRes.json()) as any;
		expect(listBody.tokens).toHaveLength(2);

		const expiringToken = listBody.tokens.find((t: any) => t.label === 'expires in 90 days');
		const permanentToken = listBody.tokens.find((t: any) => t.label === 'never expires');

		expect(expiringToken).toBeDefined();
		expect(expiringToken.expires_at_ms).not.toBeNull();
		expect(typeof expiringToken.expires_at_ms).toBe('number');

		expect(permanentToken).toBeDefined();
		expect(permanentToken.expires_at_ms).toBeNull();
	});

	it('rejects tokens with invalid expires_in_days values', async () => {
		// Test negative value
		const negativeRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'invalid', expires_in_days: -1 }),
		});
		expect(negativeRes.status).toBe(400);

		// Test zero
		const zeroRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'invalid', expires_in_days: 0 }),
		});
		expect(zeroRes.status).toBe(400);

		// Test value exceeding max (10 years = 3650 days)
		const tooLargeRes = await SELF.fetch('https://example.com/api/device-tokens', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ label: 'invalid', expires_in_days: 5000 }),
		});
		expect(tooLargeRes.status).toBe(400);
	});
});
