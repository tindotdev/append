import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { device, event, schema } from '../src/db';
import type { DashboardHeatmapResponse } from '../src/features/dashboard/rollups/types';
import { authFetch, generateUUID, getAuthCookieAndUserId } from './helpers';
import { applyMigrations } from './setup';

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as any;
	const auth = await getAuthCookieAndUserId();
	authCookie = auth.cookie;
});

afterEach(async () => {
	await db.delete(event);
	await db.delete(device);
});

/**
 * Generate a heartbeat event for testing.
 */
function heartbeatEvent(opts: {
	deviceId: string;
	eventId: string;
	emittedAtMs: number;
	host?: string;
	urlHash?: string;
	intervalMs?: number;
	windowFocused?: boolean;
	tabActive?: boolean;
	userIdle?: boolean;
}) {
	return {
		schema_version: 1,
		event_id: opts.eventId,
		device_id: opts.deviceId,
		emitted_at: opts.emittedAtMs,
		type: 'artifact_active',
		artifact: {
			url_hash: opts.urlHash ?? 'test-hash',
			host: opts.host ?? 'docs.example.com',
			path_hint: '/docs',
		},
		payload: {
			interval_ms: opts.intervalMs ?? 30_000,
			active_signals: {
				window_focused: opts.windowFocused ?? true,
				tab_active: opts.tabActive ?? true,
				user_idle: opts.userIdle ?? false,
			},
		},
	};
}

/**
 * Helper to ingest events via the API.
 */
async function ingestEvents(events: unknown[]) {
	const res = await SELF.fetch('https://example.com/events/ingest', {
		method: 'POST',
		headers: { cookie: authCookie, 'content-type': 'application/json' },
		body: JSON.stringify({ events }),
	});
	expect(res.status).toBe(200);
	return res.json();
}

describe('GET /api/dashboard/heatmap', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/dashboard/heatmap?year=2026&tz=UTC');
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing year parameter', async () => {
		const res = await authFetch('/api/dashboard/heatmap?tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for invalid year (non-numeric)', async () => {
		const res = await authFetch('/api/dashboard/heatmap?year=abc&tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for year out of range', async () => {
		const res = await authFetch('/api/dashboard/heatmap?year=1800&tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('validates timezone parameter', async () => {
		const res = await authFetch('/api/dashboard/heatmap?year=2026&tz=Invalid/Timezone', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns empty data when no events exist', async () => {
		const res = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(200);

		const body = (await res.json()) as DashboardHeatmapResponse;
		expect(body.data.year).toBe(2026);
		expect(body.data.timezone).toBe('UTC');
		expect(body.stats.totalMinutes).toBe(0);
		expect(body.stats.activeDays).toBe(0);
	});

	it('returns correct year and timezone in response', async () => {
		const res = await authFetch('/api/dashboard/heatmap?year=2025&tz=America/New_York', { cookie: authCookie });
		expect(res.status).toBe(200);

		const body = (await res.json()) as DashboardHeatmapResponse;
		expect(body.data.year).toBe(2025);
		expect(body.data.timezone).toBe('America/New_York');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Data aggregation
	// ─────────────────────────────────────────────────────────────────────────

	it('aggregates activity by day correctly', async () => {
		const deviceId = generateUUID();

		// Create events on Jan 5, 2026
		const jan5 = Date.UTC(2026, 0, 5, 12, 0, 0);
		const events = [];

		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: jan5 + i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// Find Jan 5 in the days array
		const jan5Data = body.data.days.find((d) => d.date === '2026-01-05');
		expect(jan5Data).toBeDefined();
		expect(jan5Data!.minutes).toBeGreaterThan(0);
	});

	it('computes stats correctly', async () => {
		const deviceId = generateUUID();

		// Create events on 2 different days
		const jan5 = Date.UTC(2026, 0, 5, 12, 0, 0);
		const jan6 = Date.UTC(2026, 0, 6, 12, 0, 0);

		const events = [];

		// 10 minutes on Jan 5 (20 heartbeats * 30s = 10 min)
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: jan5 + i * 30_000,
				})
			);
		}

		// 5 minutes on Jan 6 (10 heartbeats * 30s = 5 min)
		for (let i = 0; i < 10; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: jan6 + i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		expect(body.stats.activeDays).toBe(2);
		expect(body.stats.totalMinutes).toBeGreaterThan(0);
		expect(body.stats.avgPerDay).toBe(Math.round(body.stats.totalMinutes / 2));
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Credit calculation (same rules as /today)
	// ─────────────────────────────────────────────────────────────────────────

	it('credits 0 for inactive signals', async () => {
		const deviceId = generateUUID();
		const jan5 = Date.UTC(2026, 0, 5, 12, 0, 0);

		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: jan5, userIdle: true }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: jan5 + 30_000, windowFocused: false }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: jan5 + 60_000, tabActive: false }),
		]);

		const res = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		expect(body.stats.totalMinutes).toBe(0);
		expect(body.stats.activeDays).toBe(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Timezone boundaries
	// ─────────────────────────────────────────────────────────────────────────

	it('respects timezone when computing day boundaries', async () => {
		const deviceId = generateUUID();

		// Create an event at midnight UTC on Jan 1, 2026
		// In UTC-5 (EST), this is still Dec 31, 2025 at 7 PM
		const utcMidnightJan1 = Date.UTC(2026, 0, 1, 0, 30, 0);

		await ingestEvents([heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: utcMidnightJan1 })]);

		// Query for 2026 with UTC - should include the event
		const resUtc = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const bodyUtc = (await resUtc.json()) as DashboardHeatmapResponse;
		expect(bodyUtc.stats.activeDays).toBe(1);

		// Query for 2025 with UTC-5 - the event might be in 2025 depending on hour
		// At 00:30 UTC = 19:30 EST on Dec 31, so it would be in 2025
		const resEst = await authFetch('/api/dashboard/heatmap?year=2025&tz=America/New_York', { cookie: authCookie });
		const bodyEst = (await resEst.json()) as DashboardHeatmapResponse;
		// The event should appear in 2025 for EST
		expect(bodyEst.stats.activeDays).toBe(1);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Days array structure
	// ─────────────────────────────────────────────────────────────────────────

	it('returns days with correct date format', async () => {
		const res = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// All days should have YYYY-MM-DD format
		for (const day of body.data.days) {
			expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('only includes days within the requested year', async () => {
		const res = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// All days should be in 2026
		for (const day of body.data.days) {
			expect(day.date.startsWith('2026-')).toBe(true);
		}
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Edge cases
	// ─────────────────────────────────────────────────────────────────────────

	it('handles leap year correctly', async () => {
		// 2024 is a leap year
		const res = await authFetch('/api/dashboard/heatmap?year=2024&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// Check that Feb 29 exists in the days array
		const feb29 = body.data.days.find((d) => d.date === '2024-02-29');
		expect(feb29).toBeDefined();
	});

	it('does not include Feb 29 for non-leap years', async () => {
		// 2025 is not a leap year
		const res = await authFetch('/api/dashboard/heatmap?year=2025&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// Check that Feb 29 does not exist
		const feb29 = body.data.days.find((d) => d.date === '2025-02-29');
		expect(feb29).toBeUndefined();
	});

	it('correctly aggregates activity on Feb 29 in leap year (2024)', async () => {
		const deviceId = generateUUID();

		// Create events on Feb 29, 2024 (leap year)
		const feb29_2024 = Date.UTC(2024, 1, 29, 12, 0, 0); // Month is 0-indexed

		const events = [];
		// Create 10 minutes of activity (20 heartbeats * 30s)
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: feb29_2024 + i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/heatmap?year=2024&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// Verify Feb 29 exists and has activity
		const feb29Data = body.data.days.find((d) => d.date === '2024-02-29');
		expect(feb29Data).toBeDefined();
		expect(feb29Data!.minutes).toBeGreaterThan(0);
		expect(body.stats.activeDays).toBeGreaterThanOrEqual(1);
	});

	it('correctly aggregates activity on Feb 29 in leap year (2028)', async () => {
		const deviceId = generateUUID();

		// Create events on Feb 29, 2028 (leap year)
		const feb29_2028 = Date.UTC(2028, 1, 29, 15, 30, 0);

		const events = [];
		// Create 15 minutes of activity (30 heartbeats * 30s)
		for (let i = 0; i < 30; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: feb29_2028 + i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/heatmap?year=2028&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// Verify Feb 29 exists and has activity
		const feb29Data = body.data.days.find((d) => d.date === '2028-02-29');
		expect(feb29Data).toBeDefined();
		expect(feb29Data!.minutes).toBeGreaterThan(0);
		expect(body.stats.activeDays).toBeGreaterThanOrEqual(1);
	});

	it('handles date range spanning Feb 28-Mar 1 in non-leap year', async () => {
		const deviceId = generateUUID();

		// Create events on Feb 28, Mar 1, and Mar 2 of 2025 (non-leap year)
		const feb28 = Date.UTC(2025, 1, 28, 12, 0, 0);
		const mar1 = Date.UTC(2025, 2, 1, 12, 0, 0);
		const mar2 = Date.UTC(2025, 2, 2, 12, 0, 0);

		const events = [];

		// 10 minutes on Feb 28
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: feb28 + i * 30_000,
				})
			);
		}

		// 10 minutes on Mar 1
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: mar1 + i * 30_000,
				})
			);
		}

		// 10 minutes on Mar 2
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: mar2 + i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/heatmap?year=2025&tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardHeatmapResponse;

		// Verify all three days have data
		const feb28Data = body.data.days.find((d) => d.date === '2025-02-28');
		const mar1Data = body.data.days.find((d) => d.date === '2025-03-01');
		const mar2Data = body.data.days.find((d) => d.date === '2025-03-02');

		expect(feb28Data).toBeDefined();
		expect(feb28Data!.minutes).toBeGreaterThan(0);
		expect(mar1Data).toBeDefined();
		expect(mar1Data!.minutes).toBeGreaterThan(0);
		expect(mar2Data).toBeDefined();
		expect(mar2Data!.minutes).toBeGreaterThan(0);

		// Verify Feb 29 does not exist
		const feb29Data = body.data.days.find((d) => d.date === '2025-02-29');
		expect(feb29Data).toBeUndefined();

		// Verify we have 3 active days
		expect(body.stats.activeDays).toBe(3);
	});

	it('handles year boundary transitions correctly (Dec 31 to Jan 1)', async () => {
		const deviceId = generateUUID();

		// Create events on Dec 31, 2025 and Jan 1, 2026
		const dec31_2025 = Date.UTC(2025, 11, 31, 23, 0, 0); // 11 PM on Dec 31
		const jan1_2026 = Date.UTC(2026, 0, 1, 1, 0, 0); // 1 AM on Jan 1

		const events = [];

		// 10 minutes on Dec 31, 2025
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: dec31_2025 + i * 30_000,
				})
			);
		}

		// 10 minutes on Jan 1, 2026
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: jan1_2026 + i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		// Query for 2025
		const res2025 = await authFetch('/api/dashboard/heatmap?year=2025&tz=UTC', { cookie: authCookie });
		const body2025 = (await res2025.json()) as DashboardHeatmapResponse;

		// Verify Dec 31 is in 2025 data
		const dec31Data = body2025.data.days.find((d) => d.date === '2025-12-31');
		expect(dec31Data).toBeDefined();
		expect(dec31Data!.minutes).toBeGreaterThan(0);
		expect(body2025.stats.activeDays).toBe(1);

		// Verify Jan 1 is NOT in 2025 data
		const jan1In2025 = body2025.data.days.find((d) => d.date === '2026-01-01');
		expect(jan1In2025).toBeUndefined();

		// Query for 2026
		const res2026 = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const body2026 = (await res2026.json()) as DashboardHeatmapResponse;

		// Verify Jan 1 is in 2026 data
		const jan1Data = body2026.data.days.find((d) => d.date === '2026-01-01');
		expect(jan1Data).toBeDefined();
		expect(jan1Data!.minutes).toBeGreaterThan(0);
		expect(body2026.stats.activeDays).toBe(1);

		// Verify Dec 31 is NOT in 2026 data
		const dec31In2026 = body2026.data.days.find((d) => d.date === '2025-12-31');
		expect(dec31In2026).toBeUndefined();
	});

	it('handles year boundary with timezone offset (UTC-8)', async () => {
		const deviceId = generateUUID();

		// Create an event at 1 AM UTC on Jan 1, 2026
		// In America/Los_Angeles (UTC-8), this is 5 PM on Dec 31, 2025
		const utcJan1 = Date.UTC(2026, 0, 1, 1, 0, 0);

		const events = [];
		for (let i = 0; i < 20; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: utcJan1 + i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		// Query for 2026 with UTC - should have the event on Jan 1
		const resUtc = await authFetch('/api/dashboard/heatmap?year=2026&tz=UTC', { cookie: authCookie });
		const bodyUtc = (await resUtc.json()) as DashboardHeatmapResponse;
		const jan1Utc = bodyUtc.data.days.find((d) => d.date === '2026-01-01');
		expect(jan1Utc).toBeDefined();
		expect(jan1Utc!.minutes).toBeGreaterThan(0);

		// Query for 2025 with America/Los_Angeles - should have the event on Dec 31
		const resLa = await authFetch('/api/dashboard/heatmap?year=2025&tz=America/Los_Angeles', { cookie: authCookie });
		const bodyLa = (await resLa.json()) as DashboardHeatmapResponse;
		const dec31La = bodyLa.data.days.find((d) => d.date === '2025-12-31');
		expect(dec31La).toBeDefined();
		expect(dec31La!.minutes).toBeGreaterThan(0);
	});
});
