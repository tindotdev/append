import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { idempotencyKey, schema, term, termSense } from '../src/db';
import { authFetch, generateUUID, getAuthCookieAndUserId } from './helpers';
import { applyMigrations } from './setup';

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
	const auth = await getAuthCookieAndUserId();
	authCookie = auth.cookie;
});

afterEach(async () => {
	await db.delete(termSense);
	await db.delete(term);
	await db.delete(idempotencyKey);
});

describe('POST /api/guest/import-terms', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/guest/import-terms', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ clientRequestId: generateUUID(), items: [] }),
		});
		expect(res.status).toBe(401);
	});

	it('imports terms and stores an idempotency key', async () => {
		const clientRequestId = generateUUID();
		const payload = {
			clientRequestId,
			items: [
				{
					clientTermId: generateUUID(),
					term: 'Idempotency key',
					definition: 'Makes retries safe',
					bucketSlug: 'backend',
					createdAtMs: Date.now() - 60_000,
				},
				{
					clientTermId: generateUUID(),
					term: 'CAP theorem',
					definition: 'Consistency vs Availability under partitions',
					bucketSlug: 'deep-concepts',
					createdAtMs: Date.now() - 120_000,
				},
			],
		};

		const res = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.createdTermCount).toBe(2);
		expect(body.createdSenseCount).toBe(2);
		expect(body.skippedExistingCount).toBe(0);

		const terms = await db.select().from(term);
		expect(terms.length).toBe(2);
		const senses = await db.select().from(termSense);
		expect(senses.length).toBe(2);

		const keys = await db.select().from(idempotencyKey);
		expect(keys.length).toBe(1);
	});

	it('accepts schema-valid payloads larger than 64KB', async () => {
		const clientRequestId = generateUUID();
		const definition = 'x'.repeat(2000);
		const itemCount = 40; // ~80KB of definition text alone, plus JSON overhead.
		const payload = {
			clientRequestId,
			items: Array.from({ length: itemCount }, (_, i) => ({
				clientTermId: generateUUID(),
				term: `Large payload term ${i}`,
				definition,
				bucketSlug: 'backend',
				createdAtMs: Date.now() - 60_000 - i * 1_000,
			})),
		};

		const res = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.createdTermCount).toBe(itemCount);
		expect(body.createdSenseCount).toBe(itemCount);
	});

	it('dedupes canonicals within a single request (no 500, no FK failure)', async () => {
		const clientRequestId = generateUUID();
		const payload = {
			clientRequestId,
			items: [
				{
					clientTermId: generateUUID(),
					term: 'CAP theorem',
					definition: 'Consistency vs Availability under partitions',
					bucketSlug: 'deep-concepts',
					createdAtMs: Date.now() - 60_000,
				},
				{
					clientTermId: generateUUID(),
					term: '  cap   theorem  ',
					definition: 'Duplicate with different spacing/casing',
					bucketSlug: 'deep-concepts',
					createdAtMs: Date.now() - 30_000,
				},
			],
		};

		const res = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.createdTermCount).toBe(1);
		expect(body.createdSenseCount).toBe(1);
		expect(body.skippedExistingCount).toBe(1);

		const terms = await db.select().from(term);
		expect(terms.length).toBe(1);
		const senses = await db.select().from(termSense);
		expect(senses.length).toBe(1);
	});

	it('skips import when the canonical already exists', async () => {
		const first = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				clientRequestId: generateUUID(),
				items: [
					{
						clientTermId: generateUUID(),
						term: 'Outbox pattern',
						definition: 'Queue writes locally',
						bucketSlug: 'dx-tooling',
						createdAtMs: Date.now() - 60_000,
					},
				],
			}),
		});
		expect(first.status).toBe(201);

		const second = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				clientRequestId: generateUUID(),
				items: [
					{
						clientTermId: generateUUID(),
						term: 'outbox   pattern',
						definition: 'Should be skipped (already exists)',
						bucketSlug: 'dx-tooling',
						createdAtMs: Date.now() - 30_000,
					},
				],
			}),
		});
		expect(second.status).toBe(201);
		const body = (await second.json()) as any;
		expect(body.createdTermCount).toBe(0);
		expect(body.createdSenseCount).toBe(0);
		expect(body.skippedExistingCount).toBe(1);

		const terms = await db.select().from(term);
		expect(terms.length).toBe(1);
		const senses = await db.select().from(termSense);
		expect(senses.length).toBe(1);
	});

	it('replays successfully with same clientRequestId', async () => {
		const clientRequestId = generateUUID();
		const payload = {
			clientRequestId,
			items: [
				{
					clientTermId: generateUUID(),
					term: 'Outbox pattern',
					definition: 'Queue writes locally',
					bucketSlug: 'dx-tooling',
					createdAtMs: Date.now() - 60_000,
				},
			],
		};

		const first = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		});
		expect(first.status).toBe(201);

		const second = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		});
		expect(second.status).toBe(200);
		const body = (await second.json()) as any;
		expect(body.createdTermCount).toBe(1);

		const terms = await db.select().from(term);
		expect(terms.length).toBe(1);
	});

	it('returns IDEMPOTENCY_CONFLICT when body differs', async () => {
		const clientRequestId = generateUUID();
		const base = {
			clientRequestId,
			items: [
				{
					clientTermId: generateUUID(),
					term: 'Idempotency',
					definition: 'A',
					bucketSlug: 'backend',
					createdAtMs: Date.now() - 60_000,
				},
			],
		};

		const first = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(base),
		});
		expect(first.status).toBe(201);

		const conflict = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				...base,
				items: [{ ...base.items[0], definition: 'Different' }],
			}),
		});
		expect(conflict.status).toBe(409);
		const body = (await conflict.json()) as any;
		expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT');
	});

	it('validates bucket slug', async () => {
		const res = await authFetch('/api/guest/import-terms', {
			method: 'POST',
			cookie: authCookie,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				clientRequestId: generateUUID(),
				items: [
					{
						clientTermId: generateUUID(),
						term: 'X',
						definition: 'Y',
						bucketSlug: 'nope',
						createdAtMs: Date.now() - 60_000,
					},
				],
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});
});
