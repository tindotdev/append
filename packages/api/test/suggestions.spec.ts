import { env, SELF } from 'cloudflare:test';
import { BUCKETS } from '@append/contracts/types';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { batch, candidate, idempotencyKey, schema, suggestionCache, user } from '../src/db';
import { applyMigrations } from './setup';

// =============================================================================
// Test utilities
// =============================================================================

/**
 * Sign up and sign in a test user, returning the session cookie.
 */
async function getAuthCookie(email: string = 'test-a@example.com', password: string = 'test-password-123'): Promise<string> {
	// Sign up (idempotent - ignore if already exists)
	const signUpRes = await SELF.fetch('https://example.com/auth/sign-up/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password, name: 'Test User' }),
	});

	// Only throw for non-"already exists" errors
	if (!signUpRes.ok) {
		const body = await signUpRes.text();
		if (!body.includes('already exists') && !body.includes('USER_ALREADY_EXISTS')) {
			throw new Error(`Sign-up failed: ${body}`);
		}
	}

	// Sign in
	const signInRes = await SELF.fetch('https://example.com/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

	if (!signInRes.ok) {
		const body = await signInRes.text();
		throw new Error(`Sign-in failed: ${body}`);
	}

	const setCookie = signInRes.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error('No set-cookie header from sign-in');
	}

	return setCookie;
}

/**
 * Generate N lines of test terms.
 */
function generateTerms(count: number): string {
	return Array.from({ length: count }, (_, i) => `term-${i + 1}`).join('\n');
}

/**
 * Generate a valid UUID v4.
 */
function generateUUID(): string {
	return crypto.randomUUID();
}

/**
 * Create a batch and return the batch ID.
 * Uses minimum 20 terms to pass validation.
 */
async function createBatch(authCookie: string, termCount: number = 20): Promise<string> {
	const res = await SELF.fetch('https://example.com/api/batch', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			cookie: authCookie,
		},
		body: JSON.stringify({
			terms: generateTerms(termCount),
			clientRequestId: generateUUID(),
		}),
	});

	if (!res.ok) {
		throw new Error(`Failed to create batch: ${await res.text()}`);
	}

	const body = (await res.json()) as { id: string };
	return body.id;
}

// =============================================================================
// Setup
// =============================================================================

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	// Apply migrations to test database
	await applyMigrations();

	db = drizzle(env.DB, { schema }) as any;
	authCookie = await getAuthCookie();
});

afterEach(async () => {
	// Clean up test data after each test
	await db.delete(suggestionCache);
	await db.delete(idempotencyKey);
	await db.delete(candidate);
	await db.delete(batch);
});

// =============================================================================
// POST /api/batch/:id/suggest tests
// =============================================================================

describe('POST /api/batch/:id/suggest', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/batch/some-id/suggest', {
			method: 'POST',
		});

		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for non-existent batch', async () => {
		const res = await SELF.fetch(`https://example.com/api/batch/${generateUUID()}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 403 for non-owner batch', async () => {
		// Create a foreign user and batch directly in DB
		const foreignUserId = generateUUID();
		const foreignBatchId = generateUUID();
		const now = new Date();

		await db.insert(user).values({
			id: foreignUserId,
			name: 'Foreign User',
			email: 'foreign-suggest@example.com',
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		});

		await db.insert(batch).values({
			id: foreignBatchId,
			userId: foreignUserId,
			status: 'captured',
			createdAt: now,
			updatedAt: now,
		});

		// Try to suggest on foreign batch
		const res = await SELF.fetch(`https://example.com/api/batch/${foreignBatchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(403);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('FORBIDDEN');

		// Clean up
		await db.delete(batch).where(eq(batch.id, foreignBatchId));
		await db.delete(user).where(eq(user.id, foreignUserId));
	});

	it('returns 400 for invalid limit param', async () => {
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest?limit=invalid`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for limit below min', async () => {
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest?limit=0`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for limit above max', async () => {
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest?limit=201`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('generates suggestions for all candidates (stub provider)', async () => {
		const batchId = await createBatch(authCookie, 20);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest?limit=50`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.batchId).toBe(batchId);
		expect(body.mode).toBe('fill-missing');
		expect(body.candidateCount).toBe(20);
		expect(body.eligibleCount).toBe(20);
		expect(body.results.suggested).toBe(20);
		expect(body.results.cached).toBe(0);
		expect(body.results.skippedAlreadySuggested).toBe(0);
		expect(body.results.skippedInProgress).toBe(0);
		expect(body.results.errors).toBe(0);

		// Verify suggestions are stored in DB
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});

		for (const cand of candidates) {
			expect(cand.suggestedBucket).not.toBeNull();
			expect(cand.suggestedText).not.toBeNull();
			expect(cand.suggestionStatus).toBe('done');
			expect(cand.status).toBe('suggested');
		}

		// Verify batch status updated
		const batchRow = await (db.query as any).batch.findFirst({
			where: eq(batch.id, batchId),
		});
		expect(batchRow.status).toBe('suggested');
	});

	it('second call skips already-suggested candidates', async () => {
		const batchId = await createBatch(authCookie, 20);

		// First suggest call
		const res1 = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;
		expect(body1.results.suggested).toBe(20);

		// Get a candidate's suggested values to verify they don't change
		const candidatesBefore = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});
		const firstCandidateBefore = candidatesBefore[0];

		// Second suggest call - should skip all
		const res2 = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;

		expect(body2.results.suggested).toBe(0);
		expect(body2.results.skippedAlreadySuggested).toBe(20);
		expect(body2.results.cached).toBe(0);

		// Verify values didn't change
		const candidatesAfter = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});
		const firstCandidateAfter = candidatesAfter[0];

		expect(firstCandidateAfter.suggestedBucket).toBe(firstCandidateBefore.suggestedBucket);
		expect(firstCandidateAfter.suggestedText).toBe(firstCandidateBefore.suggestedText);
	});

	it('regenerate mode re-suggests already-suggested candidates', async () => {
		const batchId = await createBatch(authCookie, 20);

		// First suggest call
		await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Second call with regenerate=1
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest?regenerate=1`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.mode).toBe('regenerate');
		expect(body.results.suggested).toBe(20);
		expect(body.results.skippedAlreadySuggested).toBe(0);
	});

	it('uses cache for duplicate terms within batch', async () => {
		// Create batch with duplicate terms - need 20 minimum
		const termsWithDupes = [
			'duplicate-term',
			'duplicate-term',
			'unique-term',
			...Array.from({ length: 17 }, (_, i) => `other-term-${i}`),
		].join('\n');

		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: termsWithDupes,
				clientRequestId: generateUUID(),
			}),
		});

		const { id: batchId } = (await createRes.json()) as { id: string };

		// Suggest
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		// One of the duplicates should be cached (within-batch cache)
		expect(body.results.suggested + body.results.cached).toBe(20);
		expect(body.results.cached).toBeGreaterThanOrEqual(1);

		// Verify both duplicates have the same suggestion
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});

		const duplicates = candidates.filter((c: any) => c.normalizedTerm === 'duplicate-term');
		expect(duplicates.length).toBe(2);
		expect(duplicates[0].suggestedBucket).toBe(duplicates[1].suggestedBucket);
		expect(duplicates[0].suggestedText).toBe(duplicates[1].suggestedText);
	});

	it('suggestion cache persists to D1 and is used across batches', async () => {
		// Create first batch
		const batchId1 = await createBatch(authCookie, 20);

		// Suggest on first batch
		await SELF.fetch(`https://example.com/api/batch/${batchId1}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Verify cache entry was created
		const cacheEntries = await (db.query as any).suggestionCache.findMany();
		expect(cacheEntries.length).toBeGreaterThan(0);

		// Create second batch with the same terms
		const batchId2 = await createBatch(authCookie, 20);

		// Suggest on second batch - should use cache
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId2}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		// All should be cached
		expect(body.results.cached).toBe(20);
		expect(body.results.suggested).toBe(0);
	});

	it('does not increment candidate version when suggesting', async () => {
		const batchId = await createBatch(authCookie, 20);

		// Get version before
		const candidatesBefore = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});
		const versionsBefore = candidatesBefore.map((c: any) => c.version);

		// Suggest
		await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Get version after
		const candidatesAfter = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});
		const versionsAfter = candidatesAfter.map((c: any) => c.version);

		// Versions should not have changed
		expect(versionsAfter).toEqual(versionsBefore);
	});

	it('respects limit parameter', async () => {
		const batchId = await createBatch(authCookie, 20);

		// Suggest with limit=10
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest?limit=10`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.limit).toBe(10);
		expect(body.eligibleCount).toBe(10);
		expect(body.results.suggested).toBeLessThanOrEqual(10);

		// Verify only 10 candidates were suggested
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});

		const suggested = candidates.filter((c: any) => c.suggestionStatus === 'done');
		expect(suggested.length).toBe(10);
	});

	it('returns suggestion fields in GET /api/batch/:id response', async () => {
		const batchId = await createBatch(authCookie, 20);

		// Suggest
		await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Get batch
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		// Verify all suggestion fields are present
		for (const cand of body.candidates) {
			expect(cand).toHaveProperty('suggestedBucket');
			expect(cand).toHaveProperty('suggestedText');
			expect(cand).toHaveProperty('suggestionStatus');
			expect(cand).toHaveProperty('suggestionError');
			expect(cand).toHaveProperty('suggestionAttempts');
			expect(cand).toHaveProperty('chosenBucket');
			expect(cand).toHaveProperty('chosenText');
			expect(cand).toHaveProperty('version');
			expect(cand).toHaveProperty('materializedTermId');
			expect(cand).toHaveProperty('materializedTermSenseId');

			// Verify suggestions are populated
			expect(cand.suggestedBucket).not.toBeNull();
			expect(cand.suggestedText).not.toBeNull();
			expect(cand.suggestionStatus).toBe('done');
		}
	});

	it('stub provider generates deterministic buckets based on term hash', async () => {
		const batchId = await createBatch(authCookie, 20);

		// Suggest
		await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Get candidates
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});

		// Verify stub text format
		for (const cand of candidates) {
			expect(cand.suggestedText).toBe(`One-liner for: ${cand.normalizedTerm}`);
		}

		// Verify buckets are one of the valid options
		const validBuckets = BUCKETS;
		for (const cand of candidates) {
			expect(validBuckets).toContain(cand.suggestedBucket);
		}
	});
});
