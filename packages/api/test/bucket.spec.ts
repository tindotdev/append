import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { schema, term, termSense, user } from '../src/db';
import { applyMigrations } from './setup';

// =============================================================================
// Test utilities
// =============================================================================

/**
 * Sign up and sign in a test user, returning the session cookie and user ID.
 * Uses test-a@example.com which is on the test allowlist.
 */
async function getAuthCookieAndUserId(
	email: string = 'test-a@example.com',
	password: string = 'test-password-123'
): Promise<{ cookie: string; userId: string }> {
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

	// Get session to retrieve user ID
	const sessionRes = await SELF.fetch('https://example.com/auth/get-session', {
		headers: { cookie: setCookie },
	});

	if (!sessionRes.ok) {
		throw new Error('Failed to get session');
	}

	const session = (await sessionRes.json()) as { user: { id: string } };

	return { cookie: setCookie, userId: session.user.id };
}

/**
 * Generate a valid UUID v4.
 */
function generateUUID(): string {
	return crypto.randomUUID();
}

/**
 * Encode a cursor payload to base64url (no padding).
 */
function encodeCursor(payload: { createdAt: number; termId: string }): string {
	const json = JSON.stringify(payload);
	const bytes = new TextEncoder().encode(json);
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// =============================================================================
// Setup
// =============================================================================

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
	// Clean up test data after each test (order matters for FK constraints)
	await db.delete(termSense);
	await db.delete(term);
});

// =============================================================================
// GET /api/bucket/:slug tests
// =============================================================================

describe('GET /api/bucket/:slug', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/bucket/foundations');
		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for invalid bucket slug', async () => {
		const res = await SELF.fetch('https://example.com/api/bucket/invalid-bucket', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 400 for non-integer limit', async () => {
		const res = await SELF.fetch('https://example.com/api/bucket/foundations?limit=abc', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('integer');
	});

	it('returns 400 for limit below minimum', async () => {
		const res = await SELF.fetch('https://example.com/api/bucket/foundations?limit=0', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('between');
	});

	it('returns 400 for limit above maximum', async () => {
		const res = await SELF.fetch('https://example.com/api/bucket/foundations?limit=201', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('between');
	});

	it('returns 400 for invalid cursor', async () => {
		const res = await SELF.fetch('https://example.com/api/bucket/foundations?cursor=invalid-cursor', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toContain('cursor');
	});

	it('returns 400 for cursor with invalid shape', async () => {
		// Valid base64 but wrong JSON shape
		const invalidCursor = btoa(JSON.stringify({ foo: 'bar' }))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');

		const res = await SELF.fetch(`https://example.com/api/bucket/foundations?cursor=${invalidCursor}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns empty items for bucket with no terms', async () => {
		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.bucket).toBe('foundations');
		expect(body.items).toEqual([]);
		expect(body.nextCursor).toBeNull();
	});

	it('returns items with correct shape', async () => {
		// Seed test data
		const termId = generateUUID();
		const senseId = generateUUID();
		const now = new Date();

		await db.insert(term).values({
			id: termId,
			userId: testUserId,
			canonical: 'test-term',
			displayTerm: 'Test Term',
			primarySenseId: senseId,
			createdAt: now,
		});

		await db.insert(termSense).values({
			id: senseId,
			termId: termId,
			bucket: 'foundations',
			text: 'A test definition',
			source: 'manual',
			createdAt: now,
		});

		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.bucket).toBe('foundations');
		expect(body.items).toHaveLength(1);
		expect(body.nextCursor).toBeNull();

		const item = body.items[0];
		expect(item.termId).toBe(termId);
		expect(item.displayTerm).toBe('Test Term');
		expect(item.canonical).toBe('test-term');
		expect(item.primarySense.id).toBe(senseId);
		expect(item.primarySense.bucket).toBe('foundations');
		expect(item.primarySense.text).toBe('A test definition');
		expect(item.primarySense.createdAt).toBeTypeOf('number');
	});

	it('filters by bucket correctly', async () => {
		// Seed terms in different buckets
		const termId1 = generateUUID();
		const senseId1 = generateUUID();
		const termId2 = generateUUID();
		const senseId2 = generateUUID();
		const now = new Date();

		// Term in foundations bucket
		await db.insert(term).values({
			id: termId1,
			userId: testUserId,
			canonical: 'term-1',
			displayTerm: 'Term 1',
			primarySenseId: senseId1,
			createdAt: now,
		});

		await db.insert(termSense).values({
			id: senseId1,
			termId: termId1,
			bucket: 'foundations',
			text: 'Definition 1',
			source: 'manual',
			createdAt: now,
		});

		// Term in backend bucket
		await db.insert(term).values({
			id: termId2,
			userId: testUserId,
			canonical: 'term-2',
			displayTerm: 'Term 2',
			primarySenseId: senseId2,
			createdAt: now,
		});

		await db.insert(termSense).values({
			id: senseId2,
			termId: termId2,
			bucket: 'backend',
			text: 'Definition 2',
			source: 'manual',
			createdAt: now,
		});

		// Query foundations bucket
		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.items).toHaveLength(1);
		expect(body.items[0].termId).toBe(termId1);
	});

	it('excludes archived terms', async () => {
		const termId = generateUUID();
		const senseId = generateUUID();
		const now = new Date();

		await db.insert(term).values({
			id: termId,
			userId: testUserId,
			canonical: 'archived-term',
			displayTerm: 'Archived Term',
			primarySenseId: senseId,
			createdAt: now,
			archivedAt: now, // Archived
		});

		await db.insert(termSense).values({
			id: senseId,
			termId: termId,
			bucket: 'foundations',
			text: 'Should not appear',
			source: 'manual',
			createdAt: now,
		});

		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.items).toHaveLength(0);
	});

	it('excludes archived senses', async () => {
		const termId = generateUUID();
		const senseId = generateUUID();
		const now = new Date();

		await db.insert(term).values({
			id: termId,
			userId: testUserId,
			canonical: 'term-with-archived-sense',
			displayTerm: 'Term With Archived Sense',
			primarySenseId: senseId,
			createdAt: now,
		});

		await db.insert(termSense).values({
			id: senseId,
			termId: termId,
			bucket: 'foundations',
			text: 'Should not appear',
			source: 'manual',
			createdAt: now,
			archivedAt: now, // Archived
		});

		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.items).toHaveLength(0);
	});

	it('orders by primarySense.createdAt DESC, termId DESC', async () => {
		const now = Date.now();

		// Create 3 terms with different createdAt times
		const terms = [
			{ id: 'term-a', senseId: 'sense-a', createdAt: new Date(now - 2000) },
			{ id: 'term-b', senseId: 'sense-b', createdAt: new Date(now - 1000) },
			{ id: 'term-c', senseId: 'sense-c', createdAt: new Date(now) },
		];

		for (const t of terms) {
			await db.insert(term).values({
				id: t.id,
				userId: testUserId,
				canonical: `canonical-${t.id}`,
				displayTerm: `Display ${t.id}`,
				primarySenseId: t.senseId,
				createdAt: t.createdAt,
			});

			await db.insert(termSense).values({
				id: t.senseId,
				termId: t.id,
				bucket: 'foundations',
				text: `Definition for ${t.id}`,
				source: 'manual',
				createdAt: t.createdAt,
			});
		}

		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.items).toHaveLength(3);
		// Newest first (DESC order)
		expect(body.items[0].termId).toBe('term-c');
		expect(body.items[1].termId).toBe('term-b');
		expect(body.items[2].termId).toBe('term-a');
	});

	it('orders by termId DESC when createdAt is the same', async () => {
		const now = new Date();

		// Create 3 terms with the same createdAt (termId tiebreaker)
		const terms = ['term-z', 'term-a', 'term-m'];

		for (const id of terms) {
			const senseId = `sense-${id}`;

			await db.insert(term).values({
				id,
				userId: testUserId,
				canonical: `canonical-${id}`,
				displayTerm: `Display ${id}`,
				primarySenseId: senseId,
				createdAt: now,
			});

			await db.insert(termSense).values({
				id: senseId,
				termId: id,
				bucket: 'foundations',
				text: `Definition for ${id}`,
				source: 'manual',
				createdAt: now,
			});
		}

		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.items).toHaveLength(3);
		// termId DESC: z > m > a
		expect(body.items[0].termId).toBe('term-z');
		expect(body.items[1].termId).toBe('term-m');
		expect(body.items[2].termId).toBe('term-a');
	});

	it('respects limit parameter', async () => {
		const now = Date.now();

		// Create 5 terms
		for (let i = 0; i < 5; i++) {
			const id = `limit-term-${i}`;
			const senseId = `limit-sense-${i}`;

			await db.insert(term).values({
				id,
				userId: testUserId,
				canonical: `canonical-${id}`,
				displayTerm: `Display ${id}`,
				primarySenseId: senseId,
				createdAt: new Date(now + i * 1000),
			});

			await db.insert(termSense).values({
				id: senseId,
				termId: id,
				bucket: 'foundations',
				text: `Definition for ${id}`,
				source: 'manual',
				createdAt: new Date(now + i * 1000),
			});
		}

		const res = await SELF.fetch('https://example.com/api/bucket/foundations?limit=2', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.items).toHaveLength(2);
		// Should return the 2 newest
		expect(body.items[0].termId).toBe('limit-term-4');
		expect(body.items[1].termId).toBe('limit-term-3');
		expect(body.nextCursor).not.toBeNull();
	});

	it('returns nextCursor when more items exist', async () => {
		const now = Date.now();

		// Create 3 terms, request limit=2
		for (let i = 0; i < 3; i++) {
			const id = `cursor-term-${i}`;
			const senseId = `cursor-sense-${i}`;

			await db.insert(term).values({
				id,
				userId: testUserId,
				canonical: `canonical-${id}`,
				displayTerm: `Display ${id}`,
				primarySenseId: senseId,
				createdAt: new Date(now + i * 1000),
			});

			await db.insert(termSense).values({
				id: senseId,
				termId: id,
				bucket: 'foundations',
				text: `Definition for ${id}`,
				source: 'manual',
				createdAt: new Date(now + i * 1000),
			});
		}

		const res = await SELF.fetch('https://example.com/api/bucket/foundations?limit=2', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.items).toHaveLength(2);
		expect(body.nextCursor).not.toBeNull();
	});

	it('returns null nextCursor when no more items', async () => {
		const now = Date.now();

		// Create 2 terms, request limit=2
		for (let i = 0; i < 2; i++) {
			const id = `no-more-term-${i}`;
			const senseId = `no-more-sense-${i}`;

			await db.insert(term).values({
				id,
				userId: testUserId,
				canonical: `canonical-${id}`,
				displayTerm: `Display ${id}`,
				primarySenseId: senseId,
				createdAt: new Date(now + i * 1000),
			});

			await db.insert(termSense).values({
				id: senseId,
				termId: id,
				bucket: 'foundations',
				text: `Definition for ${id}`,
				source: 'manual',
				createdAt: new Date(now + i * 1000),
			});
		}

		const res = await SELF.fetch('https://example.com/api/bucket/foundations?limit=2', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		expect(body.items).toHaveLength(2);
		expect(body.nextCursor).toBeNull();
	});

	it('cursor pagination returns correct next page', async () => {
		const now = Date.now();

		// Create 5 terms
		for (let i = 0; i < 5; i++) {
			const id = `page-term-${i}`;
			const senseId = `page-sense-${i}`;

			await db.insert(term).values({
				id,
				userId: testUserId,
				canonical: `canonical-${id}`,
				displayTerm: `Display ${id}`,
				primarySenseId: senseId,
				createdAt: new Date(now + i * 1000),
			});

			await db.insert(termSense).values({
				id: senseId,
				termId: id,
				bucket: 'foundations',
				text: `Definition for ${id}`,
				source: 'manual',
				createdAt: new Date(now + i * 1000),
			});
		}

		// First page
		const res1 = await SELF.fetch('https://example.com/api/bucket/foundations?limit=2', {
			headers: { cookie: authCookie },
		});

		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as any;

		expect(body1.items).toHaveLength(2);
		expect(body1.items[0].termId).toBe('page-term-4');
		expect(body1.items[1].termId).toBe('page-term-3');
		expect(body1.nextCursor).not.toBeNull();

		// Second page using cursor
		const res2 = await SELF.fetch(`https://example.com/api/bucket/foundations?limit=2&cursor=${body1.nextCursor}`, {
			headers: { cookie: authCookie },
		});

		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as any;

		expect(body2.items).toHaveLength(2);
		expect(body2.items[0].termId).toBe('page-term-2');
		expect(body2.items[1].termId).toBe('page-term-1');
		expect(body2.nextCursor).not.toBeNull();

		// Third page (last item)
		const res3 = await SELF.fetch(`https://example.com/api/bucket/foundations?limit=2&cursor=${body2.nextCursor}`, {
			headers: { cookie: authCookie },
		});

		expect(res3.status).toBe(200);
		const body3 = (await res3.json()) as any;

		expect(body3.items).toHaveLength(1);
		expect(body3.items[0].termId).toBe('page-term-0');
		expect(body3.nextCursor).toBeNull();
	});

	it('only returns terms belonging to authenticated user', async () => {
		const now = new Date();

		// Create a different user's term directly in the database
		// (bypasses allowlist since we're writing directly to DB)
		const foreignUserId = generateUUID();
		const foreignTermId = generateUUID();
		const foreignSenseId = generateUUID();

		await db.insert(user).values({
			id: foreignUserId,
			name: 'Foreign User',
			email: 'foreign-bucket@example.com',
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		});

		await db.insert(term).values({
			id: foreignTermId,
			userId: foreignUserId,
			canonical: 'foreign-term',
			displayTerm: 'Foreign Term',
			primarySenseId: foreignSenseId,
			createdAt: now,
		});

		await db.insert(termSense).values({
			id: foreignSenseId,
			termId: foreignTermId,
			bucket: 'foundations',
			text: 'Should not appear',
			source: 'manual',
			createdAt: now,
		});

		// Also add an own term
		const ownTermId = generateUUID();
		const ownSenseId = generateUUID();

		await db.insert(term).values({
			id: ownTermId,
			userId: testUserId,
			canonical: 'own-term',
			displayTerm: 'Own Term',
			primarySenseId: ownSenseId,
			createdAt: now,
		});

		await db.insert(termSense).values({
			id: ownSenseId,
			termId: ownTermId,
			bucket: 'foundations',
			text: 'Should appear',
			source: 'manual',
			createdAt: now,
		});

		const res = await SELF.fetch('https://example.com/api/bucket/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as any;

		// Only the authenticated user's term should appear
		expect(body.items).toHaveLength(1);
		expect(body.items[0].termId).toBe(ownTermId);

		// Clean up foreign user (afterEach handles term/termSense cleanup)
		// Note: We need to clean up the foreign user manually since afterEach
		// only deletes terms/senses, and the term FK requires the user to exist
	});

	it('works with all valid bucket slugs', async () => {
		const buckets = ['foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'];

		for (const bucket of buckets) {
			const res = await SELF.fetch(`https://example.com/api/bucket/${bucket}`, {
				headers: { cookie: authCookie },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as any;
			expect(body.bucket).toBe(bucket);
			expect(body.items).toEqual([]);
			expect(body.nextCursor).toBeNull();
		}
	});
});
