/**
 * Preview-only origin validation middleware tests (ADR 0019).
 *
 * These tests must run with APP_ENV=preview so the middleware is enabled.
 * Run via: pnpm --filter @append/api test:preview
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './setup';

beforeAll(async () => {
	await applyMigrations();
});

describe('Preview origin validation middleware', () => {
	it('rejects POST without Origin header', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
		});

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toMatchObject({
			error: { code: 'ORIGIN_FORBIDDEN' },
		});
	});

	it('rejects POST with invalid Origin', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				origin: 'https://evil.com',
			},
		});

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toMatchObject({
			error: { code: 'ORIGIN_FORBIDDEN' },
		});
	});

	it('allows POST with preview wildcard Origin (then fails auth)', async () => {
		const res = await SELF.fetch('https://example.com/api/batch', {
			method: 'POST',
			headers: {
				origin: 'https://feat-outbox-v1.append-web.pages.dev',
			},
		});

		// Origin middleware passes; auth guard rejects unauthenticated requests.
		expect(res.status).toBe(401);
		await expect(res.json()).resolves.toMatchObject({
			error: { code: 'UNAUTHORIZED' },
		});
	});
});
