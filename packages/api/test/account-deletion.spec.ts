import { env, SELF } from 'cloudflare:test';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { beforeAll, describe, expect, it } from 'vitest';
import { account, bucket, device, deviceToken, event, idempotencyKey, schema, session, suggestionCache, term, user } from '../src/db';
import { generateUUID, getAuthCookieAndUserId } from './helpers';
import { applyMigrations } from './setup';

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
});

describe('Account deletion (ADR 0027)', () => {
	it('hard-deletes user and cascades user-owned data', async () => {
		const email = `test+delete-${generateUUID().slice(0, 8)}@example.com`;
		const { cookie, userId } = await getAuthCookieAndUserId(email);

		// Seed user-owned rows across multiple schemas.
		const bucketId = generateUUID();
		await db.insert(bucket).values({
			id: bucketId,
			userId,
			slug: 'delete-test',
			name: 'Delete Test',
			description: 'delete test bucket',
			icon: null,
			order: 999,
		});

		await db.insert(term).values({
			id: generateUUID(),
			userId,
			canonical: 'delete test',
			displayTerm: 'Delete Test',
			primarySenseId: null,
			version: 1,
			createdAt: new Date(),
			archivedAt: null,
		});

		const deviceId = generateUUID();
		const now = new Date();
		await db.insert(device).values({ id: deviceId, userId, type: 'chrome_extension', installedAt: now, lastSeenAt: now });

		await db.insert(event).values({
			userId,
			deviceId,
			eventId: generateUUID(),
			schemaVersion: 1,
			type: 'artifact_active',
			emittedAt: now,
			receivedAt: now,
			artifactHost: 'example.com',
			artifactUrlHash: 'hash',
			artifactPathHint: '/docs',
			titleHint: null,
			payloadJson: JSON.stringify({ interval_ms: 30_000, active_signals: { window_focused: true, tab_active: true, user_idle: false } }),
		});

		await db.insert(deviceToken).values({
			id: generateUUID(),
			userId,
			label: 'delete-test',
			tokenPrefix: 'delete-test-',
			tokenHash: `hash-${generateUUID()}`,
			createdAt: now,
			lastUsedAt: null,
			expiresAt: null,
			revokedAt: null,
		});

		await db.insert(idempotencyKey).values({
			userId,
			scope: 'delete-test',
			key: 'k1',
			requestHash: 'rh1',
			resultRef: 'rr1',
			createdAt: now,
			expiresAt: null,
		});

		await db.insert(suggestionCache).values({
			id: generateUUID(),
			userId,
			normalizedTerm: 'delete test',
			model: 'gpt-5-mini',
			promptVersion: 1,
			suggestedBucket: 'general',
			suggestedBucketId: null,
			suggestedText: 'A test suggestion',
			createdAt: now,
			updatedAt: now,
		});

		// Sanity: user + a few user-owned rows exist.
		const [userCountBefore] = await db.select({ count: count() }).from(user).where(eq(user.id, userId));
		expect(userCountBefore?.count).toBe(1);

		const [bucketCountBefore] = await db.select({ count: count() }).from(bucket).where(eq(bucket.userId, userId));
		expect(bucketCountBefore?.count).toBeGreaterThan(0);

		const [eventCountBefore] = await db.select({ count: count() }).from(event).where(eq(event.userId, userId));
		expect(eventCountBefore?.count).toBe(1);

		// Delete the account.
		const res = await SELF.fetch('https://example.com/api/account/delete', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify({ email, confirm: 'DELETE' }),
		});
		expect(res.status).toBe(204);

		// Verify user row is gone (hard delete) and cascades removed user-owned data.
		const [userCountAfter] = await db.select({ count: count() }).from(user).where(eq(user.id, userId));
		expect(userCountAfter?.count).toBe(0);

		const tablesWithUserId = [
			{ name: 'session', table: session, col: session.userId },
			{ name: 'account', table: account, col: account.userId },
			{ name: 'bucket', table: bucket, col: bucket.userId },
			{ name: 'term', table: term, col: term.userId },
			{ name: 'device', table: device, col: device.userId },
			{ name: 'event', table: event, col: event.userId },
			{ name: 'device_token', table: deviceToken, col: deviceToken.userId },
			{ name: 'idempotency_key', table: idempotencyKey, col: idempotencyKey.userId },
			{ name: 'suggestion_cache', table: suggestionCache, col: suggestionCache.userId },
		] as const;

		for (const t of tablesWithUserId) {
			const [row] = await db.select({ count: count() }).from(t.table).where(eq(t.col, userId));
			expect(row?.count).toBe(0);
		}
	});
});
