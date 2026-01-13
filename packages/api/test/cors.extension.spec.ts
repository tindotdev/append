/**
 * Chrome extension CORS tests with ALLOWED_EXTENSION_IDS configured (ADR 0021).
 *
 * These tests verify that extension origins work when the allowlist is configured.
 * Run via: pnpm --filter @append/api test:extension
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { getAuthCookie } from './helpers';
import { applyMigrations } from './setup';

let authCookie: string;

beforeAll(async () => {
	await applyMigrations();
	authCookie = await getAuthCookie();
});

describe('Chrome extension CORS with ALLOWED_EXTENSION_IDS set', () => {
	const allowedExtensionId = 'nnhipglpoenbcdonkbnfdcmfcfaggjle';
	const allowedExtensionOrigin = `chrome-extension://${allowedExtensionId}`;
	const disallowedExtensionId = 'abcdefghijklmnopabcdefghijklmnop';
	const disallowedExtensionOrigin = `chrome-extension://${disallowedExtensionId}`;

	describe('OPTIONS preflight requests', () => {
		it('allows CORS for allowed extension origin', async () => {
			const res = await SELF.fetch('https://example.com/events/ingest', {
				method: 'OPTIONS',
				headers: {
					origin: allowedExtensionOrigin,
				},
			});

			expect(res.status).toBe(204);
			expect(res.headers.get('access-control-allow-origin')).toBe(allowedExtensionOrigin);
			expect(res.headers.get('access-control-allow-credentials')).toBe('true');
		});

		it('rejects CORS for disallowed extension ID', async () => {
			const res = await SELF.fetch('https://example.com/events/ingest', {
				method: 'OPTIONS',
				headers: {
					origin: disallowedExtensionOrigin,
				},
			});

			expect(res.status).toBe(204);
			// Different extension ID should not get CORS headers
			expect(res.headers.get('access-control-allow-origin')).toBeNull();
		});

		it('includes Authorization header in allowed headers', async () => {
			const res = await SELF.fetch('https://example.com/events/ingest', {
				method: 'OPTIONS',
				headers: {
					origin: allowedExtensionOrigin,
					'access-control-request-headers': 'authorization,content-type',
				},
			});

			expect(res.status).toBe(204);
			const allowedHeaders = res.headers.get('access-control-allow-headers');
			expect(allowedHeaders).toContain('Authorization');
			expect(allowedHeaders).toContain('Content-Type');
		});
	});

	describe('POST requests with bearer token', () => {
		it('allows requests from allowed extension origin with valid bearer token', async () => {
			// First, get a device token using cookie auth
			const tokenRes = await SELF.fetch('https://example.com/api/device-tokens', {
				method: 'POST',
				headers: {
					cookie: authCookie,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ name: 'Test Extension Device' }),
			});

			expect(tokenRes.status).toBe(200);
			const tokenBody = (await tokenRes.json()) as { token: string };
			const bearerToken = tokenBody.token;

			// Create a valid event for testing
			const deviceId = crypto.randomUUID();
			const event = {
				schema_version: 1,
				event_id: crypto.randomUUID(),
				device_id: deviceId,
				emitted_at: Date.now(),
				type: 'artifact_active',
				artifact: { url_hash: 'hash', host: 'example.com', path_hint: '/docs' },
				payload: {
					interval_ms: 30_000,
					active_signals: { window_focused: true, tab_active: true, user_idle: false },
				},
			};

			// Now make a request from the extension origin with the bearer token
			const res = await SELF.fetch('https://example.com/events/ingest', {
				method: 'POST',
				headers: {
					origin: allowedExtensionOrigin,
					'content-type': 'application/json',
					authorization: `Bearer ${bearerToken}`,
				},
				body: JSON.stringify({ events: [event] }),
			});

			expect(res.status).toBe(200);
			expect(res.headers.get('access-control-allow-origin')).toBe(allowedExtensionOrigin);
		});

		it('rejects extension origin requests with cookie auth (requires bearer token)', async () => {
			const res = await SELF.fetch('https://example.com/events/ingest', {
				method: 'POST',
				headers: {
					origin: allowedExtensionOrigin,
					cookie: authCookie,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ events: [] }),
			});

			// Extensions must use bearer tokens, not cookies (ADR 0021 security requirement)
			expect(res.status).toBe(401);
			const body = (await res.json()) as any;
			expect(body.error.code).toBe('UNAUTHORIZED');
			expect(body.error.message).toContain('Bearer token required');
		});

		it('rejects requests from disallowed extension ID even with valid bearer token', async () => {
			// Get a valid bearer token
			const tokenRes = await SELF.fetch('https://example.com/api/device-tokens', {
				method: 'POST',
				headers: {
					cookie: authCookie,
					'content-type': 'application/json',
				},
				body: JSON.stringify({ name: 'Test Extension Device' }),
			});

			expect(tokenRes.status).toBe(200);
			const tokenBody = (await tokenRes.json()) as { token: string };
			const bearerToken = tokenBody.token;

			// Try to use it from a disallowed extension origin
			const res = await SELF.fetch('https://example.com/events/ingest', {
				method: 'POST',
				headers: {
					origin: disallowedExtensionOrigin,
					'content-type': 'application/json',
					authorization: `Bearer ${bearerToken}`,
				},
				body: JSON.stringify({ events: [] }),
			});

			// CORS should block this - no access-control-allow-origin header
			expect(res.headers.get('access-control-allow-origin')).toBeNull();
		});
	});

	describe('Fallback to web origins', () => {
		it('still allows standard web origins for /events/*', async () => {
			const res = await SELF.fetch('https://example.com/events/ingest', {
				method: 'OPTIONS',
				headers: {
					origin: 'http://localhost:5173',
				},
			});

			expect(res.status).toBe(204);
			expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
		});
	});
});
