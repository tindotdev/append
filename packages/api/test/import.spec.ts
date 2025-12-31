import { env, SELF } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bucket, idempotencyKey, schema, term, termSense, user } from '../src/db';
import { parseMarkdown } from '../src/features/import/parser/parseMarkdown';
import { suggestBucketSlug } from '../src/features/import/parser/suggestBucket';
import { applyMigrations } from './setup';

// =============================================================================
// Test utilities
// =============================================================================

async function getAuthCookie(email = 'test-a@example.com', password = 'test-password-123'): Promise<string> {
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

function createMarkdownFile(content: string, filename: string): File {
	return new File([content], filename, { type: 'text/markdown' });
}

// =============================================================================
// Setup
// =============================================================================

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as ReturnType<typeof drizzle>;
	authCookie = await getAuthCookie();
});

afterEach(async () => {
	await db.delete(idempotencyKey);
	await db.delete(termSense);
	await db.delete(term);
});

// =============================================================================
// Parser tests
// =============================================================================

describe('parseMarkdown', () => {
	it('parses standard bullet format', () => {
		const content = `- Queue: FIFO data structure.
- Array: contiguous storage layout.`;

		const result = parseMarkdown(content);

		expect(result.entries).toHaveLength(2);
		expect(result.entries[0]).toEqual({
			lineNumber: 1,
			term: 'Queue',
			definition: 'FIFO data structure.',
			isInbox: false,
		});
		expect(result.entries[1]).toEqual({
			lineNumber: 2,
			term: 'Array',
			definition: 'contiguous storage layout.',
			isInbox: false,
		});
		expect(result.warnings).toHaveLength(0);
	});

	it('handles multiple colons (uses first `: `)', () => {
		const content = '- URL: https://example.com: a web address';

		const result = parseMarkdown(content);

		expect(result.entries[0].term).toBe('URL');
		expect(result.entries[0].definition).toBe('https://example.com: a web address');
	});

	it('parses inbox format (no definition)', () => {
		const content = `execution model
event-driven
request-driven`;

		const result = parseMarkdown(content);

		// Non-bullet lines are skipped with warnings
		expect(result.entries).toHaveLength(0);
		expect(result.warnings).toHaveLength(3);
	});

	it('parses inbox bullet format', () => {
		const content = `- execution model
- event-driven`;

		const result = parseMarkdown(content);

		expect(result.entries).toHaveLength(2);
		expect(result.entries[0].isInbox).toBe(true);
		expect(result.entries[0].definition).toBe('');
	});

	it('skips headers with warning', () => {
		const content = `# Header
- Term: definition`;

		const result = parseMarkdown(content);

		expect(result.entries).toHaveLength(1);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0].message).toBe('Skipped header line');
	});

	it('skips empty lines', () => {
		const content = `- Term1: def1

- Term2: def2`;

		const result = parseMarkdown(content);

		expect(result.entries).toHaveLength(2);
		expect(result.warnings).toHaveLength(0);
	});
});

describe('suggestBucketSlug', () => {
	it('extracts slug from filename', () => {
		expect(suggestBucketSlug('foundations.md')).toBe('foundations');
		expect(suggestBucketSlug('deep-concepts.md')).toBe('deep-concepts');
		expect(suggestBucketSlug('dx-toolings.md')).toBe('dx-toolings');
	});

	it('normalizes case and special characters', () => {
		expect(suggestBucketSlug('MY_FILE.MD')).toBe('my-file');
		expect(suggestBucketSlug('Some File.md')).toBe('some-file');
	});

	it('returns null for empty or invalid filenames', () => {
		expect(suggestBucketSlug('')).toBe(null);
		expect(suggestBucketSlug('.md')).toBe(null);
	});
});

// =============================================================================
// Upload endpoint tests
// =============================================================================

describe('POST /api/import/upload', () => {
	it('returns 401 when unauthenticated', async () => {
		const formData = new FormData();
		formData.append('files', createMarkdownFile('- Term: def', 'test.md'));

		const res = await SELF.fetch('https://example.com/api/import/upload', {
			method: 'POST',
			body: formData,
		});

		expect(res.status).toBe(401);
	});

	it('returns 400 when no files provided', async () => {
		const formData = new FormData();

		const res = await SELF.fetch('https://example.com/api/import/upload', {
			method: 'POST',
			headers: { cookie: authCookie },
			body: formData,
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('uploads files and returns importId', async () => {
		const formData = new FormData();
		formData.append('files', createMarkdownFile('- Term: definition', 'foundations.md'));

		const res = await SELF.fetch('https://example.com/api/import/upload', {
			method: 'POST',
			headers: { cookie: authCookie },
			body: formData,
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { importId: string; files: Array<{ filename: string }> };
		expect(body.importId).toBeDefined();
		expect(body.files).toHaveLength(1);
		expect(body.files[0].filename).toBe('foundations.md');
	});
});

// =============================================================================
// Preview endpoint tests
// =============================================================================

describe('POST /api/import/preview', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/import/preview', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ importId: crypto.randomUUID() }),
		});

		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid importId', async () => {
		const res = await SELF.fetch('https://example.com/api/import/preview', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ importId: 'not-a-uuid' }),
		});

		expect(res.status).toBe(400);
	});

	it('returns 404 for non-existent importId', async () => {
		const res = await SELF.fetch('https://example.com/api/import/preview', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ importId: crypto.randomUUID() }),
		});

		expect(res.status).toBe(404);
	});

	it('returns preview for valid import', async () => {
		// First upload a file
		const formData = new FormData();
		formData.append('files', createMarkdownFile('- Queue: FIFO data structure.\n- Array: contiguous storage.', 'foundations.md'));

		const uploadRes = await SELF.fetch('https://example.com/api/import/upload', {
			method: 'POST',
			headers: { cookie: authCookie },
			body: formData,
		});

		const uploadBody = (await uploadRes.json()) as { importId: string };

		// Then preview
		const res = await SELF.fetch('https://example.com/api/import/preview', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({ importId: uploadBody.importId }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			importId: string;
			parsedFiles: Array<{ entries: unknown[] }>;
			stats: { totalEntries: number };
		};
		expect(body.importId).toBe(uploadBody.importId);
		expect(body.parsedFiles).toHaveLength(1);
		expect(body.stats.totalEntries).toBe(2);
	});
});

// =============================================================================
// Commit endpoint tests
// =============================================================================

describe('POST /api/import/commit', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/import/commit', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				clientRequestId: crypto.randomUUID(),
				importId: crypto.randomUUID(),
				bucketMappings: [],
			}),
		});

		expect(res.status).toBe(401);
	});

	it('returns 400 for missing clientRequestId', async () => {
		const res = await SELF.fetch('https://example.com/api/import/commit', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				importId: crypto.randomUUID(),
				bucketMappings: [],
			}),
		});

		expect(res.status).toBe(400);
	});

	it('creates terms and senses on commit', async () => {
		// Get existing buckets
		const bucketsRes = await SELF.fetch('https://example.com/api/user-bucket', {
			headers: { cookie: authCookie },
		});
		const bucketsBody = (await bucketsRes.json()) as { buckets: Array<{ id: string; slug: string }> };
		const foundationsBucket = bucketsBody.buckets.find((b) => b.slug === 'foundations');

		if (!foundationsBucket) {
			throw new Error('No foundations bucket found');
		}

		// Upload file
		const formData = new FormData();
		formData.append('files', createMarkdownFile('- TestTerm: Test definition.', 'foundations.md'));

		const uploadRes = await SELF.fetch('https://example.com/api/import/upload', {
			method: 'POST',
			headers: { cookie: authCookie },
			body: formData,
		});

		const uploadBody = (await uploadRes.json()) as { importId: string; files: Array<{ r2Key: string }> };

		// Commit
		const res = await SELF.fetch('https://example.com/api/import/commit', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				clientRequestId: crypto.randomUUID(),
				importId: uploadBody.importId,
				bucketMappings: [
					{
						r2Key: uploadBody.files[0].r2Key,
						bucketId: foundationsBucket.id,
					},
				],
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { status: string; stats: { termCreatedCount: number } };
		expect(body.status).toBe('done');
		expect(body.stats.termCreatedCount).toBe(1);
	});

	it('is idempotent on replay', async () => {
		// Get existing buckets
		const bucketsRes = await SELF.fetch('https://example.com/api/user-bucket', {
			headers: { cookie: authCookie },
		});
		const bucketsBody = (await bucketsRes.json()) as { buckets: Array<{ id: string; slug: string }> };
		const foundationsBucket = bucketsBody.buckets.find((b) => b.slug === 'foundations');

		if (!foundationsBucket) {
			throw new Error('No foundations bucket found');
		}

		// Upload file
		const formData = new FormData();
		formData.append('files', createMarkdownFile('- ReplayTerm: Replay definition.', 'foundations.md'));

		const uploadRes = await SELF.fetch('https://example.com/api/import/upload', {
			method: 'POST',
			headers: { cookie: authCookie },
			body: formData,
		});

		const uploadBody = (await uploadRes.json()) as { importId: string; files: Array<{ r2Key: string }> };
		const clientRequestId = crypto.randomUUID();

		// First commit
		const res1 = await SELF.fetch('https://example.com/api/import/commit', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				clientRequestId,
				importId: uploadBody.importId,
				bucketMappings: [{ r2Key: uploadBody.files[0].r2Key, bucketId: foundationsBucket.id }],
			}),
		});

		expect(res1.status).toBe(201);

		// Replay with same clientRequestId
		const res2 = await SELF.fetch('https://example.com/api/import/commit', {
			method: 'POST',
			headers: { cookie: authCookie, 'content-type': 'application/json' },
			body: JSON.stringify({
				clientRequestId,
				importId: uploadBody.importId,
				bucketMappings: [{ r2Key: uploadBody.files[0].r2Key, bucketId: foundationsBucket.id }],
			}),
		});

		expect(res2.status).toBe(200); // Replay returns 200
	});
});
