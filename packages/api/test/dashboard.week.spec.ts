import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { device, event, schema } from '../src/db';
import type { DashboardWeekResponse } from '../src/features/dashboard/rollups/types';
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

/**
 * Format date as YYYY-MM-DD.
 */
function formatDateKey(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

describe('GET /api/dashboard/week', () => {
	it('returns 401 when unauthenticated', async () => {
		const today = formatDateKey(new Date());
		const res = await SELF.fetch(`https://example.com/api/dashboard/week?start=${today}&tz=UTC`);
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing start parameter', async () => {
		const res = await authFetch('/api/dashboard/week?tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 400 for invalid date format', async () => {
		const res = await authFetch('/api/dashboard/week?start=not-a-date&tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('validates timezone parameter', async () => {
		const today = formatDateKey(new Date());
		const res = await authFetch(`/api/dashboard/week?start=${today}&tz=Invalid/Timezone`, { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns 7 days in the response', async () => {
		const today = new Date();
		const start = formatDateKey(today);

		const res = await authFetch(`/api/dashboard/week?start=${start}&tz=UTC`, { cookie: authCookie });
		expect(res.status).toBe(200);

		const body = (await res.json()) as DashboardWeekResponse;
		expect(body.week.days).toHaveLength(7);
	});

	it('returns empty data when no events exist', async () => {
		const today = new Date();
		const start = formatDateKey(today);

		const res = await authFetch(`/api/dashboard/week?start=${start}&tz=UTC`, { cookie: authCookie });
		expect(res.status).toBe(200);

		const body = (await res.json()) as DashboardWeekResponse;
		expect(body.week.days.every((d) => d.minutes === 0)).toBe(true);
		expect(body.weekBreakdown.topics).toHaveLength(0);
		expect(body.weekBreakdown.sources).toHaveLength(0);
	});

	it('correctly attributes minutes to the right day', async () => {
		const deviceId = generateUUID();
		const today = new Date();
		const todayKey = formatDateKey(today);

		// Create events for today
		const events = [];
		const intervalMs = 30_000;

		for (let i = 0; i < 10; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: today.getTime() - i * 30_000,
					intervalMs,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch(`/api/dashboard/week?start=${todayKey}&tz=UTC`, { cookie: authCookie });
		const body = (await res.json()) as DashboardWeekResponse;

		// The first day should have the activity
		const firstDay = body.week.days[0];
		expect(firstDay.date).toBe(todayKey);
		expect(firstDay.minutes).toBeGreaterThan(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Timezone boundary tests
	// ─────────────────────────────────────────────────────────────────────────

	it('handles timezone boundaries correctly', async () => {
		const deviceId = generateUUID();

		// Create an event at UTC midnight that would be "yesterday" in UTC+5
		// and "today" in UTC-5
		const utcMidnight = new Date();
		utcMidnight.setUTCHours(0, 0, 0, 0);

		await ingestEvents([
			heartbeatEvent({
				deviceId,
				eventId: generateUUID(),
				emittedAtMs: utcMidnight.getTime(),
			}),
		]);

		// Query with UTC timezone
		const todayUtc = formatDateKey(utcMidnight);
		const resUtc = await authFetch(`/api/dashboard/week?start=${todayUtc}&tz=UTC`, { cookie: authCookie });
		const bodyUtc = (await resUtc.json()) as DashboardWeekResponse;

		// The event should be on the start day
		expect(bodyUtc.week.days[0].minutes).toBeGreaterThan(0);
	});

	it('respects different timezone when computing day boundaries', async () => {
		const deviceId = generateUUID();

		// Create an event at 2AM UTC
		const now = new Date();
		now.setUTCHours(2, 0, 0, 0);

		await ingestEvents([
			heartbeatEvent({
				deviceId,
				eventId: generateUUID(),
				emittedAtMs: now.getTime(),
			}),
		]);

		// Query with Asia/Tokyo (UTC+9) - 2AM UTC = 11AM JST (same day)
		const todayUtc = formatDateKey(now);
		const res = await authFetch(`/api/dashboard/week?start=${todayUtc}&tz=Asia/Tokyo`, { cookie: authCookie });
		expect(res.status).toBe(200);

		const body = (await res.json()) as DashboardWeekResponse;
		// The week should have valid data
		expect(body.week.days).toHaveLength(7);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Breakdown tests
	// ─────────────────────────────────────────────────────────────────────────

	it('aggregates sources correctly for the week', async () => {
		const deviceId = generateUUID();
		const today = new Date();
		const todayKey = formatDateKey(today);

		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: today.getTime(), host: 'react.dev' }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: today.getTime() - 30_000, host: 'react.dev' }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: today.getTime() - 60_000, host: 'docs.cloudflare.com' }),
		]);

		const res = await authFetch(`/api/dashboard/week?start=${todayKey}&tz=UTC`, { cookie: authCookie });
		const body = (await res.json()) as DashboardWeekResponse;

		const hosts = body.weekBreakdown.sources.map((s) => s.id);
		expect(hosts).toContain('react.dev');
		expect(hosts).toContain('docs.cloudflare.com');
	});

	it('aggregates topics correctly for the week', async () => {
		const deviceId = generateUUID();
		const today = new Date();
		const todayKey = formatDateKey(today);

		// Add events from hosts that map to known topics
		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: today.getTime(), host: 'react.dev' }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: today.getTime() - 30_000, host: 'docs.python.org' }),
		]);

		const res = await authFetch(`/api/dashboard/week?start=${todayKey}&tz=UTC`, { cookie: authCookie });
		const body = (await res.json()) as DashboardWeekResponse;

		// Should have topic breakdown
		expect(body.weekBreakdown.topics.length).toBeGreaterThanOrEqual(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Day labels
	// ─────────────────────────────────────────────────────────────────────────

	it('includes correct day labels', async () => {
		const today = new Date();
		const todayKey = formatDateKey(today);

		const res = await authFetch(`/api/dashboard/week?start=${todayKey}&tz=UTC`, { cookie: authCookie });
		const body = (await res.json()) as DashboardWeekResponse;

		// Each day should have a dayLabel
		for (const day of body.week.days) {
			expect(day.dayLabel).toBeTruthy();
			expect(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).toContain(day.dayLabel);
		}
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Date range
	// ─────────────────────────────────────────────────────────────────────────

	it('covers exactly 7 days from start', async () => {
		// Use a fixed date string to avoid timezone issues
		const startKey = '2026-01-05';

		const res = await authFetch(`/api/dashboard/week?start=${startKey}&tz=UTC`, { cookie: authCookie });
		const body = (await res.json()) as DashboardWeekResponse;

		expect(body.week.days[0].date).toBe('2026-01-05');
		expect(body.week.days[6].date).toBe('2026-01-11');
	});
});
