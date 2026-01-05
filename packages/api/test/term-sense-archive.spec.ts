import { env, SELF } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
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
	bucketSlug = 'frontend',
	termText = 'test-term'
): Promise<{ termId: string; termVersion: number; senseId: string; senseVersion: number }> {
	// 1. Create a batch
	const createRes = await SELF.fetch('https://example.com/api/batch', {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie: authCookie },
		body: JSON.stringify({
			terms: termText,
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

/**
 * Add another sense to an existing term (directly in DB for testing).
 */
async function addSenseToTerm(
	db: ReturnType<typeof drizzle>,
	termId: string,
	bucketSlug: string,
	text: string
): Promise<{ senseId: string; senseVersion: number }> {
	const senseId = generateUUID();
	await (db as any).insert(termSense).values({
		id: senseId,
		termId,
		bucket: bucketSlug,
		text,
		source: 'manual', // Valid values: 'manual', 'batch', 'import'
		version: 1,
		createdAt: new Date(),
	});
	return { senseId, senseVersion: 1 };
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
// POST /api/term-sense/:id/archive tests
// =============================================================================

describe('POST /api/term-sense/:id/archive', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/term-sense/some-id/archive', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for non-existent sense', async () => {
		const res = await SELF.fetch(`https://example.com/api/term-sense/${generateUUID()}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('archives non-primary sense without affecting term', async () => {
		const { termId, termVersion, senseId: primarySenseId } = await createTermWithSense(authCookie);

		// Add a second sense (non-primary)
		const { senseId: secondSenseId, senseVersion: secondSenseVersion } = await addSenseToTerm(db, termId, 'backend', 'Another definition');

		// Archive the non-primary sense
		const res = await SELF.fetch(`https://example.com/api/term-sense/${secondSenseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: secondSenseVersion }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sense: { id: string; version: number; archivedAt: number };
			term?: { id: string };
		};
		expect(body.sense.id).toBe(secondSenseId);
		expect(body.sense.version).toBe(secondSenseVersion + 1);
		expect(body.sense.archivedAt).toBeTypeOf('number');
		expect(body.term).toBeUndefined(); // Term should not be affected

		// Verify term's primary sense is unchanged (use isPrimary flag since primarySenseId isn't exposed)
		const termRes = await SELF.fetch(`https://example.com/api/term/${termId}`, {
			headers: { cookie: authCookie },
		});
		const termData = (await termRes.json()) as { term: { version: number }; senses: Array<{ id: string; isPrimary: boolean }> };
		const primarySense = termData.senses.find((s) => s.isPrimary);
		expect(primarySense?.id).toBe(primarySenseId);
		expect(termData.term.version).toBe(termVersion); // Term version unchanged
	});

	it('archives primary sense and replaces with sense in same bucket', async () => {
		const { termId, senseId: primarySenseId, senseVersion: primarySenseVersion } = await createTermWithSense(authCookie, 'frontend');

		// Add a second sense in the same bucket
		const { senseId: sameBucketSenseId } = await addSenseToTerm(db, termId, 'frontend', 'Same bucket definition');

		// Archive the primary sense
		const res = await SELF.fetch(`https://example.com/api/term-sense/${primarySenseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: primarySenseVersion }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sense: { id: string; archivedAt: number };
			term: { id: string; primarySenseId: string; version: number };
		};
		expect(body.sense.id).toBe(primarySenseId);
		expect(body.sense.archivedAt).toBeTypeOf('number');
		expect(body.term.primarySenseId).toBe(sameBucketSenseId); // Replaced with same bucket sense
	});

	it('archives primary sense and replaces with sense in different bucket when no same-bucket sense exists', async () => {
		const { termId, senseId: primarySenseId, senseVersion: primarySenseVersion } = await createTermWithSense(authCookie, 'frontend');

		// Add a second sense in a different bucket
		const { senseId: diffBucketSenseId } = await addSenseToTerm(db, termId, 'backend', 'Different bucket definition');

		// Archive the primary sense
		const res = await SELF.fetch(`https://example.com/api/term-sense/${primarySenseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: primarySenseVersion }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sense: { id: string; archivedAt: number };
			term: { id: string; primarySenseId: string; version: number };
		};
		expect(body.sense.id).toBe(primarySenseId);
		expect(body.term.primarySenseId).toBe(diffBucketSenseId); // Replaced with different bucket sense
	});

	it('archives primary sense and term when no replacement exists', async () => {
		const { termId, senseId: primarySenseId, senseVersion: primarySenseVersion } = await createTermWithSense(authCookie);

		// No additional senses - archive should also archive the term
		const res = await SELF.fetch(`https://example.com/api/term-sense/${primarySenseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: primarySenseVersion }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sense: { id: string; archivedAt: number };
			term: { id: string; archivedAt: number };
		};
		expect(body.sense.id).toBe(primarySenseId);
		expect(body.sense.archivedAt).toBeTypeOf('number');
		expect(body.term.id).toBe(termId);
		expect(body.term.archivedAt).toBeTypeOf('number'); // Term also archived

		// Verify term is excluded from bucket feed
		const feedRes = await SELF.fetch('https://example.com/api/bucket/frontend', {
			headers: { cookie: authCookie },
		});
		const feedData = (await feedRes.json()) as { items: Array<{ termId: string }> };
		expect(feedData.items.some((item) => item.termId === termId)).toBe(false);
	});

	it('returns noop when sense already archived', async () => {
		const { termId, senseId, senseVersion } = await createTermWithSense(authCookie);

		// Add a second sense so we can archive the first without archiving term
		await addSenseToTerm(db, termId, 'backend', 'Another');

		// Archive first time
		const archiveRes = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion }),
		});
		const archiveBody = (await archiveRes.json()) as { sense: { version: number } };

		// Archive second time
		const res = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: archiveBody.sense.version }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { sense: { id: string }; noop: boolean };
		expect(body.noop).toBe(true);
	});

	it('returns 409 for version conflict', async () => {
		const { senseId, senseVersion } = await createTermWithSense(authCookie);

		const res = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion + 100 }), // Wrong version
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: { code: string }; details: { currentVersion: number } };
		expect(body.error.code).toBe('VERSION_CONFLICT');
		expect(body.details.currentVersion).toBe(senseVersion);
	});
});

// =============================================================================
// POST /api/term-sense/:id/restore tests
// =============================================================================

describe('POST /api/term-sense/:id/restore', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/term-sense/some-id/restore', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(401);
	});

	it('returns 404 for non-existent sense', async () => {
		const res = await SELF.fetch(`https://example.com/api/term-sense/${generateUUID()}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: 1 }),
		});

		expect(res.status).toBe(404);
	});

	it('restores archived sense without affecting active term', async () => {
		const { termId, senseId, senseVersion } = await createTermWithSense(authCookie);

		// Add a second sense so archiving primary doesn't archive term
		await addSenseToTerm(db, termId, 'frontend', 'Replacement');

		// Archive the primary sense (replacement takes over)
		const archiveRes = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion }),
		});
		const archiveBody = (await archiveRes.json()) as { sense: { version: number } };

		// Restore the sense
		const res = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: archiveBody.sense.version }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sense: { id: string; version: number; archivedAt: null };
			term?: { id: string };
		};
		expect(body.sense.id).toBe(senseId);
		expect(body.sense.archivedAt).toBeNull();
		expect(body.term).toBeUndefined(); // Term was not archived, so not restored
	});

	it('restores archived sense and parent term when both archived', async () => {
		const { termId, senseId, senseVersion } = await createTermWithSense(authCookie);

		// Archive the only sense (which also archives the term)
		const archiveRes = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion }),
		});
		const archiveBody = (await archiveRes.json()) as {
			sense: { version: number };
			term: { archivedAt: number };
		};
		expect(archiveBody.term.archivedAt).toBeTypeOf('number'); // Verify term was archived

		// Restore the sense
		const res = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: archiveBody.sense.version }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sense: { id: string; archivedAt: null };
			term: { id: string; archivedAt: null };
		};
		expect(body.sense.id).toBe(senseId);
		expect(body.sense.archivedAt).toBeNull();
		expect(body.term.id).toBe(termId);
		expect(body.term.archivedAt).toBeNull(); // Term also restored

		// Verify term reappears in bucket feed
		const feedRes = await SELF.fetch('https://example.com/api/bucket/frontend', {
			headers: { cookie: authCookie },
		});
		const feedData = (await feedRes.json()) as { items: Array<{ termId: string }> };
		expect(feedData.items.some((item) => item.termId === termId)).toBe(true);
	});

	it('returns noop when sense not archived', async () => {
		const { senseId, senseVersion } = await createTermWithSense(authCookie);

		const res = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { sense: { id: string }; noop: boolean };
		expect(body.noop).toBe(true);
	});

	it('returns 409 for version conflict', async () => {
		const { termId, senseId, senseVersion } = await createTermWithSense(authCookie);

		// Add second sense and archive the first
		await addSenseToTerm(db, termId, 'backend', 'Another');
		await SELF.fetch(`https://example.com/api/term-sense/${senseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion }),
		});

		// Try to restore with wrong version
		const res = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion }), // Old version
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: { code: string }; details: { currentVersion: number } };
		expect(body.error.code).toBe('VERSION_CONFLICT');
		expect(body.details.currentVersion).toBe(senseVersion + 1);
	});

	it('double restore returns noop on second attempt (term already active)', async () => {
		// This test verifies that attempting to restore an already-restored sense/term
		// returns noop since both are already active
		const { senseId, senseVersion } = await createTermWithSense(authCookie);

		// Archive the only sense (which also archives the term)
		const archiveRes = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/archive`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: senseVersion }),
		});
		const archiveBody = (await archiveRes.json()) as {
			sense: { version: number };
			term: { version: number };
		};

		// First restore succeeds
		const firstRestoreRes = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: archiveBody.sense.version }),
		});
		expect(firstRestoreRes.status).toBe(200);
		const firstRestoreBody = (await firstRestoreRes.json()) as {
			sense: { version: number };
			term: { version: number };
		};

		// Second restore attempt with correct NEW version - should return noop
		// since sense is already restored (archivedAt is null)
		const res = await SELF.fetch(`https://example.com/api/term-sense/${senseId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: authCookie },
			body: JSON.stringify({ expectedVersion: firstRestoreBody.sense.version }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { noop: boolean };
		expect(body.noop).toBe(true);
	});
});
