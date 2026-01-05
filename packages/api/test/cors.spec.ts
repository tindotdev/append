/**
 * CORS and origin validation tests.
 *
 * Tests the isOriginAllowed function and CORS middleware behavior (ADR 0019).
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../src/index';
import { applyMigrations } from './setup';

// =============================================================================
// Setup
// =============================================================================

beforeAll(async () => {
	await applyMigrations();
});

// =============================================================================
// isOriginAllowed unit tests
// =============================================================================

describe('isOriginAllowed', () => {
	const allowedOrigins = ['https://append.tindev.dev', 'https://*.append-web.pages.dev', 'http://localhost:5173'];

	describe('exact matches', () => {
		it('allows exact match', () => {
			expect(isOriginAllowed('https://append.tindev.dev', allowedOrigins)).toBe(true);
		});

		it('allows localhost', () => {
			expect(isOriginAllowed('http://localhost:5173', allowedOrigins)).toBe(true);
		});

		it('rejects unknown origin', () => {
			expect(isOriginAllowed('https://evil.com', allowedOrigins)).toBe(false);
		});

		it('rejects similar but different origin', () => {
			expect(isOriginAllowed('https://append.tindev.dev.evil.com', allowedOrigins)).toBe(false);
		});
	});

	describe('wildcard matches', () => {
		it('allows valid wildcard subdomain', () => {
			expect(isOriginAllowed('https://feat-outbox-v1.append-web.pages.dev', allowedOrigins)).toBe(true);
		});

		it('allows preview branch subdomain', () => {
			expect(isOriginAllowed('https://abc123.append-web.pages.dev', allowedOrigins)).toBe(true);
		});

		it('allows short subdomain', () => {
			expect(isOriginAllowed('https://a.append-web.pages.dev', allowedOrigins)).toBe(true);
		});

		it('rejects wildcard without subdomain content', () => {
			// The wildcard requires content between prefix and suffix
			expect(isOriginAllowed('https://.append-web.pages.dev', allowedOrigins)).toBe(false);
		});

		it('rejects DNS label overflow (>63 chars)', () => {
			const longLabel = 'a'.repeat(64);
			expect(isOriginAllowed(`https://${longLabel}.append-web.pages.dev`, allowedOrigins)).toBe(false);
		});

		it('allows max DNS label length (63 chars)', () => {
			const maxLabel = 'a'.repeat(63);
			expect(isOriginAllowed(`https://${maxLabel}.append-web.pages.dev`, allowedOrigins)).toBe(true);
		});
	});

	describe('input validation', () => {
		it('rejects empty origin', () => {
			expect(isOriginAllowed('', allowedOrigins)).toBe(false);
		});

		it('rejects non-http origin', () => {
			expect(isOriginAllowed('ftp://example.com', allowedOrigins)).toBe(false);
		});

		it('rejects overly long origin (>256 chars)', () => {
			const longOrigin = `https://${'a'.repeat(250)}.com`;
			expect(isOriginAllowed(longOrigin, allowedOrigins)).toBe(false);
		});
	});
});

// =============================================================================
// CORS middleware integration tests
// =============================================================================

describe('CORS headers', () => {
	it('sets CORS headers for allowed origin on OPTIONS', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'OPTIONS',
			headers: {
				origin: 'http://localhost:5173',
			},
		});

		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
		expect(res.headers.get('access-control-allow-credentials')).toBe('true');
	});

	it('does not set CORS headers for disallowed origin', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'OPTIONS',
			headers: {
				origin: 'https://evil.com',
			},
		});

		expect(res.status).toBe(204);
		// Disallowed origins should not get CORS headers
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
	});

	it('sets CORS headers for production origin', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'OPTIONS',
			headers: {
				origin: 'https://append.tindev.dev',
			},
		});

		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-origin')).toBe('https://append.tindev.dev');
	});

	// Note: Wildcard subdomain CORS (https://*.append-web.pages.dev) is only
	// enabled in preview environment. The unit tests for isOriginAllowed above
	// verify the wildcard matching logic works correctly.
});

// Note: Preview-only origin validation middleware is covered by
// `packages/api/test/cors.preview.spec.ts` and runs via `pnpm --filter @append/api test:preview`.
