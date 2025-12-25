import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { schema, batch, candidate, idempotencyKey, user } from '../src/db';
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
 * Create a batch and return the batch ID and first candidate.
 */
async function createBatchWithCandidate(authCookie: string): Promise<{ batchId: string; candidateId: string; candidateVersion: number }> {
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

	if (!createRes.ok) {
		throw new Error(`Failed to create batch: ${await createRes.text()}`);
	}

	const { id: batchId } = (await createRes.json()) as any;

	// Get the batch to find a candidate
	const getRes = await SELF.fetch(`https://example.com/api/batch/${batchId}`, {
		headers: { cookie: authCookie },
	});

	if (!getRes.ok) {
		throw new Error(`Failed to get batch: ${await getRes.text()}`);
	}

	const batchData = (await getRes.json()) as any;
	const firstCandidate = batchData.candidates[0];

	return {
		batchId,
		candidateId: firstCandidate.id,
		candidateVersion: firstCandidate.version,
	};
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
	await db.delete(idempotencyKey);
	await db.delete(candidate);
	await db.delete(batch);
});

// =============================================================================
// PUT /api/candidate/:id tests
// =============================================================================

describe('PUT /api/candidate/:id', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/candidate/some-id', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				expectedVersion: 1,
				chosenBucket: 'frontend',
			}),
		});

		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for non-existent candidate', async () => {
		const res = await SELF.fetch(`https://example.com/api/candidate/${generateUUID()}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: 1,
				chosenBucket: 'frontend',
			}),
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 403 for non-owner', async () => {
		// Seed a "foreign" user + batch + candidate directly via Drizzle
		// This bypasses the allowlist check since we're writing directly to DB
		const foreignUserId = generateUUID();
		const foreignBatchId = generateUUID();
		const foreignCandidateId = generateUUID();
		const now = new Date();

		// Create foreign user
		await db.insert(user).values({
			id: foreignUserId,
			name: 'Foreign User',
			email: 'foreign-candidate@example.com',
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
			version: 1,
			createdAt: now,
			updatedAt: now,
		});

		// Try to update the foreign user's candidate as the authenticated test user
		const res = await SELF.fetch(`https://example.com/api/candidate/${foreignCandidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: 1,
				chosenBucket: 'frontend',
			}),
		});

		expect(res.status).toBe(403);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('FORBIDDEN');

		// Clean up foreign user data
		await db.delete(candidate).where(eq(candidate.id, foreignCandidateId));
		await db.delete(batch).where(eq(batch.id, foreignBatchId));
		await db.delete(user).where(eq(user.id, foreignUserId));
	});

	it('returns 400 for missing expectedVersion', async () => {
		const { candidateId } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				chosenBucket: 'frontend',
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('expectedVersion');
	});

	it('returns 400 for non-integer expectedVersion', async () => {
		const { candidateId } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: 'not-an-integer',
				chosenBucket: 'frontend',
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('integer');
	});

	it('returns 400 for missing both chosenBucket and chosenText', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('chosenBucket');
	});

	it('returns 400 for invalid bucket slug', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenBucket: 'invalid-bucket',
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('chosenBucket');
	});

	it('returns 400 for empty chosenText', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenText: '   ', // Only whitespace
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('empty');
	});

	it('returns 400 for chosenText containing newline', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenText: 'line one\nline two',
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('single line');
	});

	it('returns 400 for chosenText exceeding 500 characters', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenText: 'x'.repeat(501),
			}),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('500');
	});

	it('returns 409 for version conflict with details.currentVersion', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		// First update succeeds
		const res1 = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenBucket: 'frontend',
			}),
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;
		expect(body1.candidate.version).toBe(candidateVersion + 1);

		// Second update with old version fails
		const res2 = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion, // Old version
				chosenBucket: 'backend',
			}),
		});

		expect(res2.status).toBe(409);
		const body2 = (await res2.json()) as any;
		expect(body2.error.code).toBe('VERSION_CONFLICT');
		expect(body2.details.currentVersion).toBe(candidateVersion + 1);
	});

	it('returns 200 and updates fields correctly', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenBucket: 'frontend',
				chosenText: 'A custom definition',
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.candidate.id).toBe(candidateId);
		expect(body.candidate.chosenBucket).toBe('frontend');
		expect(body.candidate.chosenText).toBe('A custom definition');
		expect(body.candidate.version).toBe(candidateVersion + 1);

		// Verify Step 4 fields are present
		expect(body.candidate).toHaveProperty('suggestedBucket');
		expect(body.candidate).toHaveProperty('suggestedText');
		expect(body.candidate).toHaveProperty('suggestionStatus');
		expect(body.candidate).toHaveProperty('suggestionError');
		expect(body.candidate).toHaveProperty('suggestionAttempts');
		expect(body.candidate).toHaveProperty('materializedTermId');
		expect(body.candidate).toHaveProperty('materializedTermSenseId');
	});

	it('increments version on each update', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		// First update
		const res1 = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenBucket: 'frontend',
			}),
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;
		expect(body1.candidate.version).toBe(candidateVersion + 1);

		// Second update
		const res2 = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion + 1,
				chosenBucket: 'backend',
			}),
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;
		expect(body2.candidate.version).toBe(candidateVersion + 2);
	});

	it('allows clearing both fields to null', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		// First set values
		const res1 = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenBucket: 'frontend',
				chosenText: 'Some definition',
			}),
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;
		expect(body1.candidate.chosenBucket).toBe('frontend');
		expect(body1.candidate.chosenText).toBe('Some definition');

		// Then clear both
		const res2 = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: body1.candidate.version,
				chosenBucket: null,
				chosenText: null,
			}),
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;
		expect(body2.candidate.chosenBucket).toBeNull();
		expect(body2.candidate.chosenText).toBeNull();
	});

	it('allows partial update with only chosenBucket', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenBucket: 'deep-concepts',
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.candidate.chosenBucket).toBe('deep-concepts');
		// chosenText should remain unchanged (null since we never set it)
		expect(body.candidate.chosenText).toBeNull();
	});

	it('allows partial update with only chosenText', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenText: 'Only setting text',
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.candidate.chosenText).toBe('Only setting text');
		// chosenBucket should remain unchanged (null since we never set it)
		expect(body.candidate.chosenBucket).toBeNull();
	});

	it('trims chosenText whitespace', async () => {
		const { candidateId, candidateVersion } = await createBatchWithCandidate(authCookie);

		const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				cookie: authCookie,
			},
			body: JSON.stringify({
				expectedVersion: candidateVersion,
				chosenText: '  trimmed text  ',
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.candidate.chosenText).toBe('trimmed text');
	});

	it('accepts all valid bucket slugs', async () => {
		const validBuckets = ['foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'];
		const { candidateId } = await createBatchWithCandidate(authCookie);

		let currentVersion = 1;

		for (const bucket of validBuckets) {
			const res = await SELF.fetch(`https://example.com/api/candidate/${candidateId}`, {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					cookie: authCookie,
				},
				body: JSON.stringify({
					expectedVersion: currentVersion,
					chosenBucket: bucket,
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as any;
			expect(body.candidate.chosenBucket).toBe(bucket);
			currentVersion = body.candidate.version;
		}
	});
});
