import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { batch, candidate, idempotencyKey, schema, term, termSense } from '../src/db';
import { generateUUID, getAuthCookie } from './helpers';
import { applyMigrations } from './setup';

/**
 * Create a batch, accept it, and return term/sense info for testing.
 */
async function createTermWithSense(
	authCookie: string,
	bucketSlug = 'frontend'
): Promise<{ termId: string; termVersion: number; senseId: string; senseVersion: number }> {
	// 1. Create a batch
	const createRes = await SELF.fetch('https://example.com/api/batch', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie: authCookie },
		body: JSON.stringify({
			terms: 'test-term',
			clientRequestId: generateUUID(),
		}),
	});
	if (!createRes.ok) throw new Error(`Failed to create batch: ${await createRes.text()}`);
	const { id: batchId } = (await createRes.json()) as { id: string };

	// 2. Get the candidate
	const getRes = await SELF.fetch(`https://example.com/api/batch/${batchId}`, {
		headers: { cookie: authCookie },
	});
	const batchData = (await getRes.json()) as { candidates: Array<{ id: string; version: number }> };
	const candidateId = batchData.candidates[0].id;
	const candidateVersion = batchData.candidates[0].version;

	// 3. Update candidate with bucket and text
	await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json', cookie: authCookie },
		body: JSON.stringify({
			expectedVersion: candidateVersion,
			chosenBucket: bucketSlug,
			chosenText: 'Test definition',
		}),
	});

	// 4. Accept the batch
	const acceptRes = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie: authCookie },
		body: JSON.stringify({ clientRequestId: generateUUID() }),
	});
	if (!acceptRes.ok) throw new Error(`Failed to accept batch: ${await acceptRes.text()}`);

	// 5. Get batch to retrieve materialized term/sense IDs
	const acceptedBatchRes = await SELF.fetch(`https://example.com/api/batch/${batchId}`, {
		headers: { cookie: authCookie },
	});
	const acceptedBatch = (await acceptedBatchRes.json()) as {
		candidates: Array<{ materializedTermId: string; materializedTermSenseId: string }>;
	};
	const termId = acceptedBatch.candidates[0].materializedTermId;

	// 6. Get term details to get versions
	const termRes = await SELF.fetch(`https://example.com/api/term/${termId}`, {
		headers: { cookie: authCookie },
	});
	const termData = (await termRes.json()) as { term: { id: string; version: number }; senses: Array<{ id: string; version: number }> };

	return {
		termId: termData.term.id,
		termVersion: termData.term.version,
		senseId: termData.senses[0].id,
		senseVersion: termData.senses[0].version,
	};
}

// =============================================================================
// Setup
// =============================================================================

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
	authCookie = await getAuthCookie();
});

afterEach(async () => {
	// Clean up test data
	await db.delete(idempotencyKey);
	await db.delete(termSense);
	await db.delete(term);
	await db.delete(candidate);
	await db.delete(batch);
});

// =============================================================================
// POST /api/term/:id/archive tests
// =============================================================================

describe('POST /api/term/:id/archive', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/term/some-id/archive', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for non-existent term', async () => {
		const res = await SELF.fetch(`https://example.com/api/term/${generateUUID()}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('archives term and returns updated version', async () => {
		const { termId, termVersion } = await createTermWithSense(authCookie);

		const res = await SELF.fetch(`https://example.com/api/term/${termId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { term: { id: string; version: number; archivedAt: number } };
		expect(body.term.id).toBe(termId);
		expect(body.term.version).toBe(termVersion + 1);
		expect(body.term.archivedAt).toBeTypeOf('number');
	});

	it('returns noop when term already archived', async () => {
		const { termId, termVersion } = await createTermWithSense(authCookie);

		// Archive first time
		await SELF.fetch(`https://example.com/api/term/${termId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion }),
		});

		// Archive second time with new version
		const res = await SELF.fetch(`https://example.com/api/term/${termId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion + 1 }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { term: { id: string }; noop: boolean };
		expect(body.noop).toBe(true);
	});

	it('returns 409 for version conflict', async () => {
		const { termId, termVersion } = await createTermWithSense(authCookie);

		const res = await SELF.fetch(`https://example.com/api/term/${termId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion + 100 }), // Wrong version
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: { code: string }; details: { currentVersion: number } };
		expect(body.error.code).toBe('VERSION_CONFLICT');
		expect(body.details.currentVersion).toBe(termVersion);
	});

	it('archived term is excluded from bucket feed', async () => {
		const { termId, termVersion } = await createTermWithSense(authCookie);

		// Verify term appears in feed before archive
		const beforeRes = await SELF.fetch('https://example.com/api/bucket/frontend', {
			headers: { cookie: authCookie },
		});
		const beforeData = (await beforeRes.json()) as { items: Array<{ termId: string }> };
		expect(beforeData.items.some((item) => item.termId === termId)).toBe(true);

		// Archive the term
		await SELF.fetch(`https://example.com/api/term/${termId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion }),
		});

		// Verify term is excluded from feed after archive
		const afterRes = await SELF.fetch('https://example.com/api/bucket/frontend', {
			headers: { cookie: authCookie },
		});
		const afterData = (await afterRes.json()) as { items: Array<{ termId: string }> };
		expect(afterData.items.some((item) => item.termId === termId)).toBe(false);
	});
});

// =============================================================================
// POST /api/term/:id/restore tests
// =============================================================================

describe('POST /api/term/:id/restore', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/term/some-id/restore', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(401);
	});

	it('returns 404 for non-existent term', async () => {
		const res = await SELF.fetch(`https://example.com/api/term/${generateUUID()}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(404);
	});

	it('restores archived term and returns updated version', async () => {
		const { termId, termVersion } = await createTermWithSense(authCookie);

		// Archive first
		await SELF.fetch(`https://example.com/api/term/${termId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion }),
		});

		// Restore
		const res = await SELF.fetch(`https://example.com/api/term/${termId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion + 1 }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { term: { id: string; version: number; archivedAt: null } };
		expect(body.term.id).toBe(termId);
		expect(body.term.version).toBe(termVersion + 2);
		expect(body.term.archivedAt).toBeNull();
	});

	it('returns noop when term not archived', async () => {
		const { termId, termVersion } = await createTermWithSense(authCookie);

		const res = await SELF.fetch(`https://example.com/api/term/${termId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { term: { id: string }; noop: boolean };
		expect(body.noop).toBe(true);
	});

	it('restored term appears in bucket feed again', async () => {
		const { termId, termVersion } = await createTermWithSense(authCookie);

		// Archive
		await SELF.fetch(`https://example.com/api/term/${termId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion }),
		});

		// Restore
		await SELF.fetch(`https://example.com/api/term/${termId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: termVersion + 1 }),
		});

		// Verify term reappears in feed
		const res = await SELF.fetch('https://example.com/api/bucket/frontend', {
			headers: { cookie: authCookie },
		});
		const data = (await res.json()) as { items: Array<{ termId: string }> };
		expect(data.items.some((item) => item.termId === termId)).toBe(true);
	});
});
