import { env, SELF } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { batch, candidate, idempotencyKey, schema, term, termSense, user } from '../src/db';
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

// =============================================================================
// Setup
// =============================================================================

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	// Apply migrations to test database (§5.1)
	await applyMigrations();

	db = drizzle(env.DB, { schema }) as any;
	authCookie = await getAuthCookie();
});

afterEach(async () => {
	// Clean up test data after each test (order matters for FK constraints)
	await db.delete(idempotencyKey);
	await db.delete(termSense);
	await db.delete(term);
	await db.delete(candidate);
	await db.delete(batch);
});

// =============================================================================
// POST /api/batch tests
// =============================================================================

describe('POST /api/batch', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 400 for missing clientRequestId', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ terms: generateTerms(25) }),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('clientRequestId');
	});

	it('returns 400 for invalid clientRequestId (not UUID)', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: 'not-a-uuid',
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('UUID');
	});

	it('returns 400 for empty terms', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: '',
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for fewer than 20 terms', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(19),
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('20');
	});

	it('returns 400 for more than 200 terms', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(201),
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('200');
	});

	it('returns 400 for term line exceeding max length', async () => {
		const longTerm = 'a'.repeat(201);
		const terms = [longTerm, ...Array.from({ length: 24 }, (_, i) => `term-${i}`)].join('\n');

		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('200 characters');
	});

	it('returns 413 for payload too large', async () => {
		// Create a payload > 64 KiB
		const largePayload = 'x'.repeat(65 * 1024);

		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: largePayload,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(413);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
	});

	it('creates batch + candidates with 201 status', async () => {
		const terms = generateTerms(25);
		const clientRequestId = generateUUID();

		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ terms, clientRequestId }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.id).toBeDefined();
		expect(body.candidateCount).toBe(25);

		// Verify batch in database
		const batchRow = await (db.query as any).batch.findFirst({
			where: eq(batch.id, body.id),
		});
		expect(batchRow).toBeDefined();
		expect(batchRow?.status).toBe('captured');

		// Verify candidates in database
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, body.id),
		});
		expect(candidates.length).toBe(25);
	});

	it('replays with same clientRequestId + same terms (200)', async () => {
		const terms = generateTerms(25);
		const clientRequestId = generateUUID();

		// First request - creates
		const res1 = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ terms, clientRequestId }),
		});

		expect(res1.status).toBe(201);
		const body1 = (await res1.json()) as any;

		// Second request - replays
		const res2 = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ terms, clientRequestId }),
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;
		expect(body2.id).toBe(body1.id);
		expect(body2.candidateCount).toBe(body1.candidateCount);
	});

	it('returns 409 for same clientRequestId + different terms', async () => {
		const clientRequestId = generateUUID();

		// First request
		const res1 = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId,
			}),
		});

		expect(res1.status).toBe(201);

		// Second request with different terms
		const res2 = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(30), // Different terms
				clientRequestId,
			}),
		});

		expect(res2.status).toBe(409);
		const body = await res2.json();
		expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT');
	});

	it('normalizes terms correctly', async () => {
		const terms = [
			'  Hello   World  ', // Should normalize to "hello world"
			'UPPERCASE', // Should normalize to "uppercase"
			'  multiple   spaces  ', // Should normalize to "multiple spaces"
			...Array.from({ length: 22 }, (_, i) => `term-${i}`),
		].join('\n');

		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as any;

		// Verify normalization in database
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, body.id),
			orderBy: (candidate: any, { asc }: any) => [asc(candidate.position)],
		});

		expect(candidates[0].term).toBe('Hello   World');
		expect(candidates[0].normalizedTerm).toBe('hello world');

		expect(candidates[1].term).toBe('UPPERCASE');
		expect(candidates[1].normalizedTerm).toBe('uppercase');

		expect(candidates[2].term).toBe('multiple   spaces');
		expect(candidates[2].normalizedTerm).toBe('multiple spaces');
	});

	it("rejects terms containing ': '", async () => {
		const terms = [
			'valid term',
			'HTTP: Protocol', // Contains ': ' - should be rejected
			...Array.from({ length: 23 }, (_, i) => `term-${i}`),
		].join('\n');

		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toBe("Term at line 2 contains ': ' which is not allowed");
	});

	it('preserves duplicates as distinct candidates', async () => {
		const terms = ['duplicate-term', 'duplicate-term', 'duplicate-term', ...Array.from({ length: 22 }, (_, i) => `unique-term-${i}`)].join(
			'\n'
		);

		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.candidateCount).toBe(25);

		// Verify all duplicates are preserved
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, body.id),
		});
		const duplicates = candidates.filter((c: any) => c.term === 'duplicate-term');
		expect(duplicates.length).toBe(3);
	});
});

// =============================================================================
// GET /api/batch/:id tests
// =============================================================================

describe('GET /api/batch/:id', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/batch/some-id');
		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for non-existent batch', async () => {
		const res = await SELF.fetch(`https://example.com/api/batch/${generateUUID()}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 403 for non-owner', async () => {
		// Seed a "foreign" user + batch + candidate directly via Drizzle (§5.1)
		// This bypasses the allowlist check since we're writing directly to DB
		const foreignUserId = generateUUID();
		const foreignBatchId = generateUUID();
		const foreignCandidateId = generateUUID();
		const now = new Date();

		// Create foreign user
		await db.insert(user).values({
			id: foreignUserId,
			name: 'Foreign User',
			email: 'foreign@example.com',
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		});

		// Create foreign batch
		await db.insert(batch).values({
			id: foreignBatchId,
			userId: foreignUserId,
			status: 'captured',
			createdAt: now,
			updatedAt: now,
		});

		// Create foreign candidate
		await db.insert(candidate).values({
			id: foreignCandidateId,
			batchId: foreignBatchId,
			position: 0,
			term: 'foreign-term',
			normalizedTerm: 'foreign-term',
			status: 'captured',
			createdAt: now,
			updatedAt: now,
		});

		// Try to access the foreign user's batch as the authenticated test user
		const res = await SELF.fetch(`https://example.com/api/batch/${foreignBatchId}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(403);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('FORBIDDEN');

		// Clean up foreign user data
		await db.delete(candidate).where(eq(candidate.id, foreignCandidateId));
		await db.delete(batch).where(eq(batch.id, foreignBatchId));
		await db.delete(user).where(eq(user.id, foreignUserId));
	});

	it('returns 200 with batch details for owner', async () => {
		// Create a batch
		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});

		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// Get the batch
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.id).toBe(batchId);
		expect(body.status).toBe('captured');
		expect(body.candidateCount).toBe(25);
		expect(body.candidates).toHaveLength(25);
		expect(body.createdAt).toBeTypeOf('number');
		expect(body.updatedAt).toBeTypeOf('number');

		// Verify candidates are ordered by position
		for (let i = 0; i < body.candidates.length; i++) {
			expect(body.candidates[i].position).toBe(i);
			expect(body.candidates[i].term).toBe(`term-${i + 1}`);
		}
	});

	it('returns Step 4 fields in candidate response', async () => {
		// Create a batch
		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});

		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// Get the batch
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		// Verify each candidate includes Step 4 fields
		for (const cand of body.candidates) {
			// Core fields
			expect(cand).toHaveProperty('id');
			expect(cand).toHaveProperty('position');
			expect(cand).toHaveProperty('term');
			expect(cand).toHaveProperty('normalizedTerm');
			expect(cand).toHaveProperty('status');

			// Step 4 chosen fields
			expect(cand).toHaveProperty('chosenBucket');
			expect(cand).toHaveProperty('chosenText');

			// Step 4 suggested fields
			expect(cand).toHaveProperty('suggestedBucket');
			expect(cand).toHaveProperty('suggestedText');
			expect(cand).toHaveProperty('suggestionStatus');
			expect(cand).toHaveProperty('suggestionError');
			expect(cand).toHaveProperty('suggestionAttempts');

			// Step 4 version and materialization fields
			expect(cand).toHaveProperty('version');
			expect(cand).toHaveProperty('materializedTermId');
			expect(cand).toHaveProperty('materializedTermSenseId');

			// Timestamps
			expect(cand).toHaveProperty('createdAt');
			expect(cand).toHaveProperty('updatedAt');
			expect(cand.createdAt).toBeTypeOf('number');
			expect(cand.updatedAt).toBeTypeOf('number');

			// For a new batch, these should be null
			expect(cand.chosenBucket).toBeNull();
			expect(cand.chosenText).toBeNull();
			expect(cand.suggestedBucket).toBeNull();
			expect(cand.suggestedText).toBeNull();
			expect(cand.suggestionStatus).toBeNull();
			expect(cand.suggestionError).toBeNull();
			expect(cand.suggestionAttempts).toBe(0);
			expect(cand.version).toBe(1);
			expect(cand.materializedTermId).toBeNull();
			expect(cand.materializedTermSenseId).toBeNull();
		}
	});
});

// =============================================================================
// GET /api/batch (list) tests
// =============================================================================

describe('GET /api/batch (list)', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/batch');
		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns empty list when user has no batches', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.batches).toEqual([]);
		expect(body.nextCursor).toBeNull();
	});

	it('returns batches ordered by most recent first', async () => {
		// Create 3 batches
		const batchIds: string[] = [];
		for (let i = 0; i < 3; i++) {
			const res = await SELF.fetch('https://example.com/api/batch', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: authCookie,
				},
				body: JSON.stringify({
					terms: generateTerms(25),
					clientRequestId: generateUUID(),
				}),
			});
			expect(res.status).toBe(201);
			const { id } = (await res.json()) as any;
			batchIds.push(id);
		}

		// List batches
		const res = await SELF.fetch('https://example.com/api/batch', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.batches).toHaveLength(3);
		// Most recent first (reverse order of creation)
		expect(body.batches[0].id).toBe(batchIds[2]);
		expect(body.batches[1].id).toBe(batchIds[1]);
		expect(body.batches[2].id).toBe(batchIds[0]);
		expect(body.nextCursor).toBeNull();
	});

	it('returns batch with correct fields', async () => {
		// Create a batch
		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// List batches
		const res = await SELF.fetch('https://example.com/api/batch', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.batches).toHaveLength(1);
		const batchItem = body.batches[0];

		expect(batchItem.id).toBe(batchId);
		expect(batchItem.status).toBe('captured');
		expect(batchItem.candidateCount).toBe(25);
		expect(batchItem.createdAt).toBeTypeOf('number');
		expect(batchItem.updatedAt).toBeTypeOf('number');
	});

	it('respects limit parameter', async () => {
		// Create 5 batches
		for (let i = 0; i < 5; i++) {
			const res = await SELF.fetch('https://example.com/api/batch', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: authCookie,
				},
				body: JSON.stringify({
					terms: generateTerms(25),
					clientRequestId: generateUUID(),
				}),
			});
			expect(res.status).toBe(201);
		}

		// List with limit=2
		const res = await SELF.fetch('https://example.com/api/batch?limit=2', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.batches).toHaveLength(2);
		expect(body.nextCursor).not.toBeNull();
	});

	it('returns 400 for invalid limit', async () => {
		const res = await SELF.fetch('https://example.com/api/batch?limit=0', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for limit > 100', async () => {
		const res = await SELF.fetch('https://example.com/api/batch?limit=101', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('supports cursor-based pagination', async () => {
		// Create 5 batches
		const batchIds: string[] = [];
		for (let i = 0; i < 5; i++) {
			const res = await SELF.fetch('https://example.com/api/batch', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: authCookie,
				},
				body: JSON.stringify({
					terms: generateTerms(25),
					clientRequestId: generateUUID(),
				}),
			});
			expect(res.status).toBe(201);
			const { id } = (await res.json()) as any;
			batchIds.push(id);
		}

		// First page (limit=2)
		const res1 = await SELF.fetch('https://example.com/api/batch?limit=2', {
			headers: { cookie: authCookie },
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;

		expect(body1.batches).toHaveLength(2);
		expect(body1.batches[0].id).toBe(batchIds[4]); // Most recent
		expect(body1.batches[1].id).toBe(batchIds[3]);
		expect(body1.nextCursor).not.toBeNull();

		// Second page
		const res2 = await SELF.fetch(`https://example.com/api/batch?limit=2&cursor=${body1.nextCursor}`, {
			headers: { cookie: authCookie },
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;

		expect(body2.batches).toHaveLength(2);
		expect(body2.batches[0].id).toBe(batchIds[2]);
		expect(body2.batches[1].id).toBe(batchIds[1]);
		expect(body2.nextCursor).not.toBeNull();

		// Third page (last)
		const res3 = await SELF.fetch(`https://example.com/api/batch?limit=2&cursor=${body2.nextCursor}`, {
			headers: { cookie: authCookie },
		});

		expect(res3.status).toBe(200);
		const body3 = (await res3.json()) as any;

		expect(body3.batches).toHaveLength(1);
		expect(body3.batches[0].id).toBe(batchIds[0]); // Oldest
		expect(body3.nextCursor).toBeNull(); // No more pages
	});

	it('does not return batches from other users', async () => {
		// Create a batch as authenticated user
		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});
		expect(createRes.status).toBe(201);

		// Create a foreign user with a batch directly in DB
		const foreignUserId = generateUUID();
		const foreignBatchId = generateUUID();
		const now = new Date();

		await db.insert(user).values({
			id: foreignUserId,
			name: 'Foreign List User',
			email: 'foreign-list@example.com',
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

		await db.insert(candidate).values({
			id: generateUUID(),
			batchId: foreignBatchId,
			position: 0,
			term: 'foreign-term',
			normalizedTerm: 'foreign-term',
			status: 'captured',
			createdAt: now,
			updatedAt: now,
		});

		// List batches as authenticated user
		const res = await SELF.fetch('https://example.com/api/batch', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		// Should only see own batch, not foreign batch
		expect(body.batches).toHaveLength(1);
		expect(body.batches[0].id).not.toBe(foreignBatchId);

		// Clean up foreign user data
		await db.delete(candidate).where(eq(candidate.batchId, foreignBatchId));
		await db.delete(batch).where(eq(batch.id, foreignBatchId));
		await db.delete(user).where(eq(user.id, foreignUserId));
	});

	it('reflects updated batch status', async () => {
		// Create and suggest a batch
		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// Generate suggestions
		const suggestRes = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});
		expect(suggestRes.status).toBe(200);

		// List batches
		const res = await SELF.fetch('https://example.com/api/batch', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.batches).toHaveLength(1);
		expect(body.batches[0].status).toBe('suggested');
	});
});

// =============================================================================
// OPTIONS preflight tests
// =============================================================================

describe('OPTIONS preflight', () => {
	it('returns 204 without auth for /api/* routes', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'OPTIONS',
		});

		expect(res.status).toBe(204);
	});
});

// =============================================================================
// POST /api/batch/:id/accept tests
// =============================================================================

describe('POST /api/batch/:id/accept', () => {
	/**
	 * Helper to create a batch with suggested candidates (ready for accept)
	 */
	async function createSuggestedBatch(termCount: number = 25): Promise<string> {
		// Create batch
		const createRes = await SELF.fetch('https://example.com/api/batch', {
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
		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// Generate suggestions (stub provider)
		const suggestRes = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});
		expect(suggestRes.status).toBe(200);

		return batchId;
	}

	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/batch/some-id/accept', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for non-existent batch', async () => {
		const res = await SELF.fetch(`https://example.com/api/batch/${generateUUID()}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 403 for non-owner batch', async () => {
		// Create a foreign user and batch
		const foreignUserId = generateUUID();
		const foreignBatchId = generateUUID();
		const now = new Date();

		await db.insert(user).values({
			id: foreignUserId,
			name: 'Foreign User',
			email: 'foreign-accept@example.com',
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		});

		await db.insert(batch).values({
			id: foreignBatchId,
			userId: foreignUserId,
			status: 'suggested',
			createdAt: now,
			updatedAt: now,
		});

		// Try to accept as authenticated user
		const res = await SELF.fetch(`https://example.com/api/batch/${foreignBatchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(403);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('FORBIDDEN');

		// Clean up
		await db.delete(batch).where(eq(batch.id, foreignBatchId));
		await db.delete(user).where(eq(user.id, foreignUserId));
	});

	it('returns 400 for missing clientRequestId', async () => {
		const batchId = await createSuggestedBatch();

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('clientRequestId');
	});

	it('returns 400 for invalid clientRequestId (not UUID)', async () => {
		const batchId = await createSuggestedBatch();

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: 'not-a-uuid' }),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('UUID');
	});

	it('returns 409 BATCH_NOT_READY when suggestions are in progress', async () => {
		// Create batch without suggestions
		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// Manually set a candidate to in_progress
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});
		await db.update(candidate).set({ suggestionStatus: 'in_progress' }).where(eq(candidate.id, candidates[0].id));

		// Try to accept
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('BATCH_NOT_READY');
		expect(body.details.reason).toBe('SUGGESTIONS_IN_PROGRESS');
		expect(body.details.inProgressCandidateIds).toContain(candidates[0].id);
	});

	it('returns 409 BATCH_NOT_READY when candidates are missing effective fields', async () => {
		// Create batch without suggestions (no suggested fields)
		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// Try to accept without suggestions
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('BATCH_NOT_READY');
		expect(body.details.reason).toBe('MISSING_EFFECTIVE_FIELDS');
		expect(body.details.missingCandidateIds).toHaveLength(25);
	});

	it('successfully creates terms and term_senses (200)', async () => {
		const batchId = await createSuggestedBatch();

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.batchId).toBe(batchId);
		expect(body.status).toBe('accepted');
		expect(body.candidateCount).toBe(25);
		expect(body.acceptedCount).toBe(25);
		expect(body.skippedAlreadyAcceptedCount).toBe(0);
		expect(body.termCreatedCount).toBe(25);
		expect(body.termSenseCreatedCount).toBe(25);
		expect(body.flaggedCount).toBe(0);

		// Verify batch status is updated
		const batchRow = await (db.query as any).batch.findFirst({
			where: eq(batch.id, batchId),
		});
		expect(batchRow.status).toBe('accepted');

		// Verify candidates are materialized
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
		});
		for (const cand of candidates) {
			expect(cand.status).toBe('accepted');
			expect(cand.materializedTermId).not.toBeNull();
			expect(cand.materializedTermSenseId).not.toBeNull();
		}

		// Verify terms and term_senses created
		const terms = await (db.query as any).term.findMany();
		expect(terms.length).toBe(25);

		const senses = await (db.query as any).termSense.findMany();
		expect(senses.length).toBe(25);
	});

	it('replays with same clientRequestId (returns cached summary)', async () => {
		const batchId = await createSuggestedBatch();
		const clientRequestId = generateUUID();

		// First accept
		const res1 = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId }),
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;

		// Second accept (replay)
		const res2 = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId }),
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;

		// Response should be identical
		expect(body2).toEqual(body1);

		// No duplicate terms/senses created
		const terms = await (db.query as any).term.findMany();
		expect(terms.length).toBe(25);

		const senses = await (db.query as any).termSense.findMany();
		expect(senses.length).toBe(25);
	});

	it('returns 409 IDEMPOTENCY_CONFLICT for same clientRequestId with different batch', async () => {
		const batchId1 = await createSuggestedBatch();
		const batchId2 = await createSuggestedBatch();
		const clientRequestId = generateUUID();

		// Accept batch 1
		const res1 = await SELF.fetch(`https://example.com/api/batch/${batchId1}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId }),
		});

		expect(res1.status).toBe(200);

		// Try to accept batch 2 with same clientRequestId
		const res2 = await SELF.fetch(`https://example.com/api/batch/${batchId2}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId }),
		});

		expect(res2.status).toBe(409);
		const body = (await res2.json()) as any;
		expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT');
		expect(body.details.originalBatchId).toBe(batchId1);
	});

	it('retry with different clientRequestId skips already materialized candidates', async () => {
		const batchId = await createSuggestedBatch();

		// First accept
		const res1 = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;
		expect(body1.acceptedCount).toBe(25);
		expect(body1.skippedAlreadyAcceptedCount).toBe(0);

		// Second accept with different clientRequestId
		const res2 = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;
		expect(body2.acceptedCount).toBe(0);
		expect(body2.skippedAlreadyAcceptedCount).toBe(25);

		// No duplicate terms/senses
		const terms = await (db.query as any).term.findMany();
		expect(terms.length).toBe(25);

		const senses = await (db.query as any).termSense.findMany();
		expect(senses.length).toBe(25);
	});

	it('deduplicates same canonical terms within batch', async () => {
		// Create batch with duplicate terms
		const terms = ['duplicate', 'duplicate', 'duplicate', ...Array.from({ length: 22 }, (_, i) => `unique-${i}`)].join('\n');

		const createRes = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: batchId } = (await createRes.json()) as any;

		// Suggest
		await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Accept
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		// 25 candidates, but only 23 unique terms (duplicate appears 3 times)
		expect(body.candidateCount).toBe(25);
		expect(body.termCreatedCount).toBe(23); // 22 unique + 1 "duplicate"
		expect(body.termSenseCreatedCount).toBe(25); // Each candidate gets a sense

		// Verify term count in DB
		const termsInDb = await (db.query as any).term.findMany();
		expect(termsInDb.length).toBe(23);

		// Verify sense count in DB
		const sensesInDb = await (db.query as any).termSense.findMany();
		expect(sensesInDb.length).toBe(25);
	});

	it('flags bucket conflicts for existing terms', async () => {
		// Create and accept first batch
		const batchId1 = await createSuggestedBatch();

		const res1 = await SELF.fetch(`https://example.com/api/batch/${batchId1}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});
		expect(res1.status).toBe(200);

		// Get first term's canonical to create conflict
		const firstTerm = await (db.query as any).term.findFirst();
		const firstSense = await (db.query as any).termSense.findFirst({
			where: eq(termSense.termId, firstTerm.id),
		});

		// Create second batch with same term but we'll override the bucket
		const secondBatchTerms = [firstTerm.displayTerm, ...Array.from({ length: 24 }, (_, i) => `second-batch-term-${i}`)].join('\n');

		const createRes2 = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: secondBatchTerms,
				clientRequestId: generateUUID(),
			}),
		});
		expect(createRes2.status).toBe(201);
		const { id: batchId2 } = (await createRes2.json()) as any;

		// Suggest second batch
		await SELF.fetch(`https://example.com/api/batch/${batchId2}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Set a different bucket for the conflicting candidate
		const secondBatchCandidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId2),
		});
		const conflictingCandidate = secondBatchCandidates.find((c: any) => c.term === firstTerm.displayTerm);

		// Set a different bucket than the primary sense
		const differentBucket = firstSense.bucket === 'foundations' ? 'backend' : 'foundations';
		await db.update(candidate).set({ chosenBucket: differentBucket }).where(eq(candidate.id, conflictingCandidate.id));

		// Accept second batch
		const res2 = await SELF.fetch(`https://example.com/api/batch/${batchId2}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;

		// One flagged due to bucket conflict
		expect(body2.flaggedCount).toBe(1);

		// Verify flagged_reason in DB
		const flaggedSenses = await (db.query as any).termSense.findMany({
			where: eq(termSense.flaggedReason, 'bucket_conflict'),
		});
		expect(flaggedSenses.length).toBe(1);
	});

	it('uses chosen fields over suggested fields when set', async () => {
		const batchId = await createSuggestedBatch();

		// Override chosen fields for first candidate
		const candidates = await (db.query as any).candidate.findMany({
			where: eq(candidate.batchId, batchId),
			orderBy: (c: any, { asc }: any) => [asc(c.position)],
		});

		await db
			.update(candidate)
			.set({
				chosenBucket: 'deep-concepts',
				chosenText: 'Custom definition override',
			})
			.where(eq(candidate.id, candidates[0].id));

		// Accept
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/accept`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({ clientRequestId: generateUUID() }),
		});

		expect(res.status).toBe(200);

		// Verify the term sense uses chosen values
		const updatedCandidate = await (db.query as any).candidate.findFirst({
			where: eq(candidate.id, candidates[0].id),
		});
		const sense = await (db.query as any).termSense.findFirst({
			where: eq(termSense.id, updatedCandidate.materializedTermSenseId),
		});

		expect(sense.bucket).toBe('deep-concepts');
		expect(sense.text).toBe('Custom definition override');
	});
});
