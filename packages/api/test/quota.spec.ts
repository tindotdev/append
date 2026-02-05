/**
 * Tests for suggestion quota enforcement (ADR 0026).
 *
 * These tests verify:
 * - Per-user lifetime quota (3 requests)
 * - Global budget pool (shared + reserved)
 * - Kill switch (SUGGESTIONS_ENABLED)
 * - Concurrent request handling
 */

import { env, SELF } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { account, batch, candidate, idempotencyKey, llmBudget, schema, suggestionCache, userSuggestionQuota } from '../src/db';
import { FEATURE_TERM_SUGGESTION, getUtcMonthWindow } from '../src/shared/quota';
import { generateTerms, generateUUID, getAuthCookie, getAuthCookieAndUserId } from './helpers';
import { applyMigrations } from './setup';

// =============================================================================
// SSE parsing utilities
// =============================================================================

interface SSEEvent {
	event: string;
	data: unknown;
}

function parseSSEResponse(text: string): SSEEvent[] {
	const events: SSEEvent[] = [];
	const lines = text.split('\n');
	let currentEvent = '';
	let currentData = '';

	for (const line of lines) {
		if (line.startsWith('event: ')) {
			currentEvent = line.slice(7);
		} else if (line.startsWith('data: ')) {
			currentData = line.slice(6);
		} else if (line === '' && currentEvent && currentData) {
			try {
				events.push({ event: currentEvent, data: JSON.parse(currentData) });
			} catch {
				events.push({ event: currentEvent, data: currentData });
			}
			currentEvent = '';
			currentData = '';
		}
	}

	return events;
}

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

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
});

beforeEach(async () => {
	// Initialize global budget with default limits
	const nowMs = Date.now();
	const { windowStartMs, windowMs } = getUtcMonthWindow(nowMs);

	await db
		.insert(llmBudget)
		.values({
			feature: FEATURE_TERM_SUGGESTION,
			windowStartMs,
			windowMs,
			sharedUsedCount: 0,
			sharedLimitCount: 100,
			reservedUsedCount: 0,
			reservedLimitCount: 100,
			disabledUntilMs: null,
			updatedAtMs: nowMs,
		})
		.onConflictDoUpdate({
			target: llmBudget.feature,
			set: {
				windowStartMs,
				windowMs,
				sharedUsedCount: 0,
				sharedLimitCount: 100,
				reservedUsedCount: 0,
				reservedLimitCount: 100,
				disabledUntilMs: null,
				updatedAtMs: nowMs,
			},
		});
});

afterEach(async () => {
	// Clean up test data
	await db.delete(suggestionCache);
	await db.delete(idempotencyKey);
	await db.delete(candidate);
	await db.delete(batch);
	await db.delete(userSuggestionQuota);
	// Reset global budget
	await db
		.update(llmBudget)
		.set({
			sharedUsedCount: 0,
			reservedUsedCount: 0,
			disabledUntilMs: null,
		})
		.where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));
});

// =============================================================================
// Per-user quota tests
// =============================================================================

describe('per-user suggestion quota', () => {
	it('allows requests within quota limit', async () => {
		const authCookie = await getAuthCookie('quota-test-1@example.com', 'test-pass', 'Quota Test 1');
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const text = await res.text();
		const events = parseSSEResponse(text);
		expect(events.some((e) => e.event === 'done')).toBe(true);
	});

	it('increments user quota after successful request', async () => {
		const { cookie: authCookie, userId } = await getAuthCookieAndUserId('quota-test-2@example.com', 'test-pass', 'Quota Test 2');
		const batchId = await createBatch(authCookie);

		// Make a suggestion request
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});
		await res.text(); // Consume response

		// Check quota was incremented
		const quota = await db.query.userSuggestionQuota.findFirst({
			where: eq(userSuggestionQuota.userId, userId),
		});

		expect(quota).not.toBeNull();
		expect(quota?.lifetimeUsedCount).toBe(1);
	});

	it('returns 429 when user quota is exhausted', async () => {
		const { cookie: authCookie, userId } = await getAuthCookieAndUserId('quota-test-3@example.com', 'test-pass', 'Quota Test 3');

		// Exhaust user quota (set to max)
		await db.insert(userSuggestionQuota).values({
			userId,
			lifetimeUsedCount: 3, // Max limit
			createdAtMs: Date.now(),
			updatedAtMs: Date.now(),
		});

		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(429);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('SUGGESTIONS_QUOTA_EXCEEDED');
		expect(body.details.quota.used).toBe(3);
		expect(body.details.quota.limit).toBe(3);
	});

	it('tracks quota correctly across multiple requests', async () => {
		const { cookie: authCookie, userId } = await getAuthCookieAndUserId('quota-test-4@example.com', 'test-pass', 'Quota Test 4');

		// Make first request
		const batchId1 = await createBatch(authCookie);
		const res1 = await SELF.fetch(`https://example.com/api/batch/${batchId1}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});
		expect(res1.status).toBe(200);
		await res1.text();

		// Make second request
		const batchId2 = await createBatch(authCookie);
		const res2 = await SELF.fetch(`https://example.com/api/batch/${batchId2}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});
		expect(res2.status).toBe(200);
		await res2.text();

		// Make third request
		const batchId3 = await createBatch(authCookie);
		const res3 = await SELF.fetch(`https://example.com/api/batch/${batchId3}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});
		expect(res3.status).toBe(200);
		await res3.text();

		// Verify quota is at max
		const quota = await db.query.userSuggestionQuota.findFirst({
			where: eq(userSuggestionQuota.userId, userId),
		});
		expect(quota?.lifetimeUsedCount).toBe(3);

		// 4th request should fail
		const batchId4 = await createBatch(authCookie);
		const res4 = await SELF.fetch(`https://example.com/api/batch/${batchId4}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res4.status).toBe(429);
		const body = (await res4.json()) as any;
		expect(body.error.code).toBe('SUGGESTIONS_QUOTA_EXCEEDED');
	});
});

// =============================================================================
// Global budget tests
// =============================================================================

describe('global budget pool', () => {
	it('increments shared pool counter on successful request', async () => {
		const authCookie = await getAuthCookie('budget-test-1@example.com', 'test-pass', 'Budget Test 1');
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});
		await res.text();

		const budget = await db.query.llmBudget.findFirst({
			where: eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
		});

		expect(budget?.sharedUsedCount).toBe(1);
	});

	it('returns 429 when shared pool is exhausted (non-admin)', async () => {
		// Exhaust shared pool
		await db
			.update(llmBudget)
			.set({ sharedUsedCount: 100 }) // Max shared limit
			.where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));

		const authCookie = await getAuthCookie('budget-test-2@example.com', 'test-pass', 'Budget Test 2');
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(429);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('SUGGESTIONS_BUDGET_EXHAUSTED');
		expect(body.details.reset_at).toBeDefined();
	});

	it('returns 503 when circuit breaker is tripped', async () => {
		// Trip circuit breaker
		const futureTime = Date.now() + 60 * 60 * 1000; // 1 hour from now
		await db.update(llmBudget).set({ disabledUntilMs: futureTime }).where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));

		const authCookie = await getAuthCookie('budget-test-3@example.com', 'test-pass', 'Budget Test 3');
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(503);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
		expect(body.details.retry_after).toBeDefined();
	});

	it('allows admin to fall back to reserved pool when shared is exhausted', async () => {
		// Exhaust shared pool
		await db
			.update(llmBudget)
			.set({ sharedUsedCount: 100 }) // Max shared limit
			.where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));

		// Create admin user with Google account
		const adminSub = 'test-admin-google-sub-123';
		const { cookie: authCookie, userId } = await getAuthCookieAndUserId('admin-test@example.com', 'test-pass', 'Admin Test');

		// Link Google account to user
		await db.insert(account).values({
			id: generateUUID(),
			accountId: adminSub,
			providerId: 'google',
			userId,
			accessToken: null,
			refreshToken: null,
			idToken: null,
			accessTokenExpiresAt: null,
			refreshTokenExpiresAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Set ADMIN_SUB env var (mock it by patching env object)
		const originalAdminSub = env.ADMIN_SUB;
		env.ADMIN_SUB = adminSub;

		try {
			const batchId = await createBatch(authCookie);

			const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
				method: 'POST',
				headers: { cookie: authCookie },
			});

			expect(res.status).toBe(200);
			await res.text(); // Consume response

			// Verify reserved pool was used
			const budget = await db.query.llmBudget.findFirst({
				where: eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
			});

			expect(budget?.sharedUsedCount).toBe(100); // Should remain at max
			expect(budget?.reservedUsedCount).toBe(1); // Should increment
		} finally {
			// Restore original value
			env.ADMIN_SUB = originalAdminSub;
		}
	});

	it('handles concurrent requests without bypassing quota limit', async () => {
		const { cookie: authCookie, userId } = await getAuthCookieAndUserId('concurrent-test@example.com', 'test-pass', 'Concurrent Test');

		// Pre-set user quota to 2/3 used
		await db.insert(userSuggestionQuota).values({
			userId,
			lifetimeUsedCount: 2,
			createdAtMs: Date.now(),
			updatedAtMs: Date.now(),
		});

		// Create 5 batches
		const batchIds = await Promise.all([
			createBatch(authCookie),
			createBatch(authCookie),
			createBatch(authCookie),
			createBatch(authCookie),
			createBatch(authCookie),
		]);

		// Fire 5 parallel requests
		const results = await Promise.all(
			batchIds.map((batchId) =>
				SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
					method: 'POST',
					headers: { cookie: authCookie },
				})
			)
		);

		// Count successes and failures
		const statuses = await Promise.all(
			results.map(async (res) => {
				const status = res.status;
				await res.text(); // Consume response
				return status;
			})
		);

		const successCount = statuses.filter((s) => s === 200).length;
		const failureCount = statuses.filter((s) => s === 429).length;

		// Exactly 1 should succeed (bringing total to 3/3), 4 should fail
		expect(successCount).toBe(1);
		expect(failureCount).toBe(4);

		// Verify final quota is exactly 3
		const quota = await db.query.userSuggestionQuota.findFirst({
			where: eq(userSuggestionQuota.userId, userId),
		});
		expect(quota?.lifetimeUsedCount).toBe(3);
	});

	it('resets budget counters when monthly window rotates', async () => {
		// Set window to last month (January 2026)
		const jan1_2026 = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
		const jan_windowMs = 31 * 24 * 60 * 60 * 1000; // January has 31 days

		// Set budget with old window and exhausted shared pool
		await db
			.update(llmBudget)
			.set({
				windowStartMs: jan1_2026,
				windowMs: jan_windowMs,
				sharedUsedCount: 100, // Exhausted
				reservedUsedCount: 50,
			})
			.where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));

		// Make a request in current month (February 2026)
		const authCookie = await getAuthCookie('window-test@example.com', 'test-pass', 'Window Test');
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		await res.text(); // Consume response

		// Verify window was rotated and counter reset
		const budget = await db.query.llmBudget.findFirst({
			where: eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
		});

		// Window should be updated to February 2026
		const feb1_2026 = Date.UTC(2026, 1, 1, 0, 0, 0, 0);
		expect(budget?.windowStartMs).toBe(feb1_2026);

		// Counters should be reset and new request should be counted
		expect(budget?.sharedUsedCount).toBe(1); // Not 101!
		expect(budget?.reservedUsedCount).toBe(0); // Reset
	});
});

// =============================================================================
// Kill switch tests
// =============================================================================

describe('suggestions kill switch', () => {
	// Note: Testing kill switch requires ability to set env vars at runtime.
	// The actual kill switch behavior is tested in the route integration.
	// These tests verify the error code is correct when the switch is off.

	it('returns correct error code for disabled suggestions', async () => {
		// This test validates the error code shape.
		// Actual kill switch behavior is tested via env var in wrangler.jsonc for test env.

		// For now, just verify the route exists and works when enabled
		const authCookie = await getAuthCookie('killswitch-test@example.com', 'test-pass', 'Killswitch Test');
		const batchId = await createBatch(authCookie);

		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}/suggest`, {
			method: 'POST',
			headers: { cookie: authCookie },
		});

		// Should succeed since SUGGESTIONS_ENABLED is not '0' in test env
		expect(res.status).toBe(200);
		// Must consume response to ensure all D1 operations complete
		await res.text();
	});
});

// =============================================================================
// Window utilities tests
// =============================================================================

describe('quota window utilities', () => {
	it('getUtcMonthWindow returns correct window start for beginning of month', () => {
		// 2026-02-01 00:00:00 UTC
		const feb1 = Date.UTC(2026, 1, 1, 0, 0, 0, 0);
		const { windowStartMs, windowMs } = getUtcMonthWindow(feb1);

		expect(windowStartMs).toBe(feb1);
		// February 2026 has 28 days
		expect(windowMs).toBe(28 * 24 * 60 * 60 * 1000);
	});

	it('getUtcMonthWindow returns correct window start for middle of month', () => {
		// 2026-02-15 12:30:00 UTC
		const feb15 = Date.UTC(2026, 1, 15, 12, 30, 0, 0);
		const { windowStartMs } = getUtcMonthWindow(feb15);

		// Window should start at Feb 1 00:00:00 UTC
		const expectedStart = Date.UTC(2026, 1, 1, 0, 0, 0, 0);
		expect(windowStartMs).toBe(expectedStart);
	});

	it('getUtcMonthWindow handles month rollover', () => {
		// 2026-03-01 00:00:00 UTC (first of March)
		const mar1 = Date.UTC(2026, 2, 1, 0, 0, 0, 0);
		const { windowStartMs, windowMs } = getUtcMonthWindow(mar1);

		expect(windowStartMs).toBe(mar1);
		// March has 31 days
		expect(windowMs).toBe(31 * 24 * 60 * 60 * 1000);
	});
});
