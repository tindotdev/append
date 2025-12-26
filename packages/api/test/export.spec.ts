import { env, SELF } from 'cloudflare:test';
import { BUCKET_TITLES, BUCKETS } from '@append/contracts/types';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { schema, term, termSense, user } from '../src/db';
import { applyMigrations } from './setup';

// =============================================================================
// Test utilities
// =============================================================================

/**
 * Sign up and sign in a test user, returning the session cookie and user ID.
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
// GET /api/export/:bucket tests
// =============================================================================

describe('GET /api/export/:bucket', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/export/foundations');
		expect(res.status).toBe(401);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 for invalid bucket', async () => {
		const res = await SELF.fetch('https://example.com/api/export/invalid-bucket', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(404);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns correct content-type and content-disposition headers', async () => {
		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(res.headers.get('content-disposition')).toBe('attachment; filename="foundations.md"');
	});

	it('returns valid markdown for empty bucket', async () => {
		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Should be: "# Foundations\n\n" (header + blank line + trailing newline)
		expect(text).toBe('# Foundations\n\n');
	});

	it('exports terms with correct markdown format', async () => {
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

		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Verify exact format
		expect(text).toBe('# Foundations\n\n- Test Term: A test definition\n');
	});

	it("handles definitions containing ': ' correctly", async () => {
		// The delimiter is the FIRST ': ' - definitions can contain ': ' freely
		const termId = generateUUID();
		const senseId = generateUUID();
		const now = new Date();

		await db.insert(term).values({
			id: termId,
			userId: testUserId,
			canonical: 'http',
			displayTerm: 'HTTP',
			primarySenseId: senseId,
			createdAt: now,
		});

		await db.insert(termSense).values({
			id: senseId,
			termId: termId,
			bucket: 'backend',
			text: 'Hypertext Transfer Protocol: a protocol for transmitting documents',
			source: 'manual',
			createdAt: now,
		});

		const res = await SELF.fetch('https://example.com/api/export/backend', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Definition contains ': ' which is allowed
		expect(text).toBe('# Backend\n\n- HTTP: Hypertext Transfer Protocol: a protocol for transmitting documents\n');
	});

	it('orders by primarySense.createdAt ASC, termId ASC (deterministic)', async () => {
		const now = Date.now();

		// Create 3 terms with different createdAt times
		const terms = [
			{
				id: 'term-c',
				senseId: 'sense-c',
				createdAt: new Date(now),
				displayTerm: 'Term C',
			},
			{
				id: 'term-a',
				senseId: 'sense-a',
				createdAt: new Date(now - 2000),
				displayTerm: 'Term A',
			},
			{
				id: 'term-b',
				senseId: 'sense-b',
				createdAt: new Date(now - 1000),
				displayTerm: 'Term B',
			},
		];

		for (const t of terms) {
			await db.insert(term).values({
				id: t.id,
				userId: testUserId,
				canonical: `canonical-${t.id}`,
				displayTerm: t.displayTerm,
				primarySenseId: t.senseId,
				createdAt: t.createdAt,
			});

			await db.insert(termSense).values({
				id: t.senseId,
				termId: t.id,
				bucket: 'foundations',
				text: `Definition for ${t.displayTerm}`,
				source: 'manual',
				createdAt: t.createdAt,
			});
		}

		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Oldest first (ASC order)
		const lines = text.split('\n');
		expect(lines[0]).toBe('# Foundations');
		expect(lines[1]).toBe('');
		expect(lines[2]).toBe('- Term A: Definition for Term A');
		expect(lines[3]).toBe('- Term B: Definition for Term B');
		expect(lines[4]).toBe('- Term C: Definition for Term C');
	});

	it('orders by termId ASC when createdAt is the same', async () => {
		const now = new Date();

		// Create 3 terms with the same createdAt (termId tiebreaker)
		const termIds = ['term-z', 'term-a', 'term-m'];

		for (const id of termIds) {
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

		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		const lines = text.split('\n');
		// termId ASC: a < m < z
		expect(lines[2]).toBe('- Display term-a: Definition for term-a');
		expect(lines[3]).toBe('- Display term-m: Definition for term-m');
		expect(lines[4]).toBe('- Display term-z: Definition for term-z');
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

		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Should be empty (just header)
		expect(text).toBe('# Foundations\n\n');
	});

	it('excludes terms whose primary sense is archived', async () => {
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
			archivedAt: now, // Archived sense
		});

		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Should be empty (just header)
		expect(text).toBe('# Foundations\n\n');
	});

	it('excludes terms when both term and sense are archived', async () => {
		const termId = generateUUID();
		const senseId = generateUUID();
		const now = new Date();

		await db.insert(term).values({
			id: termId,
			userId: testUserId,
			canonical: 'both-archived',
			displayTerm: 'Both Archived',
			primarySenseId: senseId,
			createdAt: now,
			archivedAt: now, // Archived term
		});

		await db.insert(termSense).values({
			id: senseId,
			termId: termId,
			bucket: 'foundations',
			text: 'Should not appear',
			source: 'manual',
			createdAt: now,
			archivedAt: now, // Archived sense
		});

		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Should be empty (just header)
		expect(text).toBe('# Foundations\n\n');
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

		// Export foundations
		const res1 = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res1.status).toBe(200);
		const text1 = await res1.text();
		expect(text1).toContain('Term 1');
		expect(text1).not.toContain('Term 2');

		// Export backend
		const res2 = await SELF.fetch('https://example.com/api/export/backend', {
			headers: { cookie: authCookie },
		});

		expect(res2.status).toBe(200);
		const text2 = await res2.text();
		expect(text2).toContain('Term 2');
		expect(text2).not.toContain('Term 1');
	});

	it('only exports terms belonging to authenticated user', async () => {
		const now = new Date();

		// Create a different user's term directly in the database
		const foreignUserId = generateUUID();
		const foreignTermId = generateUUID();
		const foreignSenseId = generateUUID();

		await db.insert(user).values({
			id: foreignUserId,
			name: 'Foreign User',
			email: 'foreign-export@example.com',
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
			text: 'Should not appear in export',
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
			text: 'Should appear in export',
			source: 'manual',
			createdAt: now,
		});

		const res = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();

		// Only the authenticated user's term should appear
		expect(text).toContain('Own Term');
		expect(text).not.toContain('Foreign Term');
	});

	it('works with all valid bucket slugs and titles', async () => {
		const buckets = BUCKETS.map((slug) => ({ slug, title: BUCKET_TITLES[slug] }));

		for (const bucket of buckets) {
			const res = await SELF.fetch(`https://example.com/api/export/${bucket.slug}`, {
				headers: { cookie: authCookie },
			});

			expect(res.status).toBe(200);
			const text = await res.text();
			expect(text).toBe(`# ${bucket.title}\n\n`);
			expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${bucket.slug}.md"`);
		}
	});

	it('produces deterministic output (stable across refreshes)', async () => {
		const now = Date.now();

		// Create multiple terms
		for (let i = 0; i < 3; i++) {
			const termId = `stable-term-${i}`;
			const senseId = `stable-sense-${i}`;

			await db.insert(term).values({
				id: termId,
				userId: testUserId,
				canonical: `stable-canonical-${i}`,
				displayTerm: `Stable Term ${i}`,
				primarySenseId: senseId,
				createdAt: new Date(now + i * 1000),
			});

			await db.insert(termSense).values({
				id: senseId,
				termId: termId,
				bucket: 'foundations',
				text: `Stable definition ${i}`,
				source: 'manual',
				createdAt: new Date(now + i * 1000),
			});
		}

		// Fetch twice
		const res1 = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});
		const text1 = await res1.text();

		const res2 = await SELF.fetch('https://example.com/api/export/foundations', {
			headers: { cookie: authCookie },
		});
		const text2 = await res2.text();

		// Should be byte-identical
		expect(text1).toBe(text2);
	});
});
