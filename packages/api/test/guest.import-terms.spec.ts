import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { idempotencyKey, schema, term, termSense } from '../src/db';
import { importGuestTerms } from '../src/features/guest/usecases/importGuestTerms';
import { withCanonicals } from '../src/features/guest/validation/importGuestTerms.schema';
import { sha256Hex } from '../src/shared/crypto';
import { encodeJsonResultRef } from '../src/shared/idempotency/result-ref';
import { authFetch, generateUUID, getAuthCookieAndUserId } from './helpers';
import { applyMigrations } from './setup';

let authCookie: string;
let userId: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
	const auth = await getAuthCookieAndUserId();
	authCookie = auth.cookie;
	userId = auth.userId;
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

	it('replays instead of 500 when idempotency insert races (PK conflict)', async () => {
		const clientRequestId = generateUUID();
		const payload = {
			clientRequestId,
			items: [
				{
					clientTermId: generateUUID(),
					term: 'Idempotency race',
					definition: 'Second request should replay',
					bucketSlug: 'backend',
					createdAtMs: Date.now() - 60_000,
				},
			],
		};

		const input = withCanonicals(payload);
		const stableRequestString = input.items
			.map((i) => `${i.term}\n${i.definition}\n${i.bucketSlug}\n${i.createdAtMs}\n${i.clientTermId}`)
			.join('\n---\n');
		const requestHash = await sha256Hex(stableRequestString);

		const storedResult = {
			importedCount: 1,
			createdTermCount: 1,
			createdSenseCount: 1,
			skippedExistingCount: 0,
		};

		const racingRawDb = {
			prepare: env.DB.prepare.bind(env.DB),
			batch: async () => {
				await db.insert(idempotencyKey).values({
					userId,
					scope: 'guest_import_terms',
					key: clientRequestId,
					requestHash,
					resultRef: encodeJsonResultRef('guest_import_terms', storedResult),
					expiresAt: null,
				});
				throw new Error('UNIQUE constraint failed: idempotency_key.user_id, idempotency_key.scope, idempotency_key.key');
			},
		} as any;

		const result = await importGuestTerms(db as any, racingRawDb, userId, input);
		expect(result.success).toBe(true);
		if (!result.success) throw new Error('Expected success');
		expect(result.isReplay).toBe(true);
		expect(result.result).toEqual(storedResult);
	});

	it('returns IDEMPOTENCY_CONFLICT when raced idempotency key hash differs', async () => {
		const clientRequestId = generateUUID();
		const payload = {
			clientRequestId,
			items: [
				{
					clientTermId: generateUUID(),
					term: 'Idempotency race conflict',
					definition: 'A',
					bucketSlug: 'backend',
					createdAtMs: Date.now() - 60_000,
				},
			],
		};

		const input = withCanonicals(payload);
		const otherHash = await sha256Hex('different payload');

		const racingRawDb = {
			prepare: env.DB.prepare.bind(env.DB),
			batch: async () => {
				await db.insert(idempotencyKey).values({
					userId,
					scope: 'guest_import_terms',
					key: clientRequestId,
					requestHash: otherHash,
					resultRef: encodeJsonResultRef('guest_import_terms', { ok: true }),
					expiresAt: null,
				});
				throw new Error('UNIQUE constraint failed: idempotency_key.user_id, idempotency_key.scope, idempotency_key.key');
			},
		} as any;

		const result = await importGuestTerms(db as any, racingRawDb, userId, input);
		expect(result.success).toBe(false);
		if (result.success) throw new Error('Expected failure');
		expect(result.error.type).toBe('idempotency_conflict');
	});
});
