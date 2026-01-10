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
});
