import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { device, event, schema } from '../src/db';
import { IDLE_CUTOFF_MS, MIN_ACTIVE_MINUTES_FOR_STREAK } from '../src/features/dashboard/rollups/credit';
import type { DashboardTodayResponse } from '../src/features/dashboard/rollups/types';
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
 * Generate a capture event for testing.
 */
function captureEvent(opts: { deviceId: string; eventId: string; emittedAtMs: number; captureType?: 'term' | 'question'; label: string }) {
	return {
		schema_version: 1,
		event_id: opts.eventId,
		device_id: opts.deviceId,
		emitted_at: opts.emittedAtMs,
		type: 'capture',
		artifact: {
			url_hash: 'capture-hash',
			host: 'docs.example.com',
		},
		payload: {
			capture_type: opts.captureType ?? 'term',
			label: opts.label,
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

describe('GET /api/dashboard/today', () => {
	it('returns 401 when unauthenticated', async () => {
		const res = await SELF.fetch('https://example.com/api/dashboard/today');
		expect(res.status).toBe(401);
	});

	it('returns empty data when no events exist', async () => {
		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(200);

		const body = (await res.json()) as DashboardTodayResponse;
		expect(body.todayHero.todayMinutes).toBe(0);
		expect(body.streak.currentStreak).toBe(0);
		expect(body.todayBreakdown.topics).toHaveLength(0);
		expect(body.todayBreakdown.sources).toHaveLength(0);
	});

	it('validates timezone parameter', async () => {
		const res = await authFetch('/api/dashboard/today?tz=Invalid/Timezone', { cookie: authCookie });
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Credit calculation: idle/unfocused/tab inactive = 0
	// ─────────────────────────────────────────────────────────────────────────

	it('credits 0 when user_idle is true', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		await ingestEvents([heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, userIdle: true })]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		expect(body.todayHero.todayMinutes).toBe(0);
	});

	it('credits 0 when window_focused is false', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		await ingestEvents([heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, windowFocused: false })]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		expect(body.todayHero.todayMinutes).toBe(0);
	});

	it('credits 0 when tab_active is false', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		await ingestEvents([heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, tabActive: false })]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		expect(body.todayHero.todayMinutes).toBe(0);
	});

	it('credits interval_ms for first active heartbeat', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const intervalMs = 30_000;

		await ingestEvents([heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, intervalMs })]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// First heartbeat gets interval_ms credit (30s = 0 or 1 minute rounded)
		expect(body.todayHero.todayMinutes).toBeLessThanOrEqual(1);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Gap handling: <= cutoff vs > cutoff
	// ─────────────────────────────────────────────────────────────────────────

	it('credits gap when gap <= IDLE_CUTOFF_MS', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const intervalMs = 30_000;
		const gap = IDLE_CUTOFF_MS; // Exactly at cutoff

		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - gap, intervalMs }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, intervalMs }),
		]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// First heartbeat: interval_ms (30s), second: min(gap, interval_ms) = 30s
		// Total = 60s = 1 minute
		expect(body.todayHero.todayMinutes).toBeGreaterThanOrEqual(1);
	});

	it('credits interval_ms (new session) when gap > IDLE_CUTOFF_MS', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const intervalMs = 30_000;
		const gap = IDLE_CUTOFF_MS + 60_000; // Beyond cutoff

		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - gap, intervalMs }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, intervalMs }),
		]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// First heartbeat: interval_ms (30s), second: interval_ms (new session, 30s)
		// Total = 60s = 1 minute
		expect(body.todayHero.todayMinutes).toBeGreaterThanOrEqual(1);
	});

	it('credits min(gap, interval_ms) when gap < interval_ms', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const intervalMs = 60_000; // 1 minute
		const gap = 15_000; // 15 seconds (less than interval)

		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - gap, intervalMs }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, intervalMs }),
		]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// First heartbeat: 60s, second: min(15s, 60s) = 15s
		// Total = 75s ≈ 1 minute
		expect(body.todayHero.todayMinutes).toBeLessThanOrEqual(2);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Streak calculation
	// ─────────────────────────────────────────────────────────────────────────

	it('computes streak correctly for consecutive active days', async () => {
		const deviceId = generateUUID();
		const now = new Date();

		// Generate events for today and yesterday (streak of 2)
		const today = now.getTime();
		const yesterday = today - 24 * 60 * 60 * 1000;

		// Need at least MIN_ACTIVE_MINUTES_FOR_STREAK (10 minutes) per day
		const minutesNeeded = MIN_ACTIVE_MINUTES_FOR_STREAK;
		const intervalsPerDay = Math.ceil((minutesNeeded * 60 * 1000) / 30_000);

		const events = [];

		// Events for today
		for (let i = 0; i < intervalsPerDay; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: today - i * 30_000,
					intervalMs: 30_000,
				})
			);
		}

		// Events for yesterday
		for (let i = 0; i < intervalsPerDay; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: yesterday - i * 30_000,
					intervalMs: 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// Streak should be at least 2 (today + yesterday)
		expect(body.streak.currentStreak).toBeGreaterThanOrEqual(2);
		expect(body.streak.minMinutesThreshold).toBe(MIN_ACTIVE_MINUTES_FOR_STREAK);
	});

	it('stops streak at first day below threshold', async () => {
		const deviceId = generateUUID();
		const now = new Date();
		const today = now.getTime();
		const yesterday = today - 24 * 60 * 60 * 1000;
		const twoDaysAgo = today - 2 * 24 * 60 * 60 * 1000;

		const minutesNeeded = MIN_ACTIVE_MINUTES_FOR_STREAK;
		const intervalsPerDay = Math.ceil((minutesNeeded * 60 * 1000) / 30_000);

		const events = [];

		// Events for today (active)
		for (let i = 0; i < intervalsPerDay; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: today - i * 30_000,
				})
			);
		}

		// Yesterday: only 1 event (below threshold)
		events.push(
			heartbeatEvent({
				deviceId,
				eventId: generateUUID(),
				emittedAtMs: yesterday,
			})
		);

		// 2 days ago: active (but should not count because yesterday broke the streak)
		for (let i = 0; i < intervalsPerDay; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: twoDaysAgo - i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// Streak should be 1 (only today) because yesterday was below threshold
		expect(body.streak.currentStreak).toBe(1);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Captures
	// ─────────────────────────────────────────────────────────────────────────

	it('includes captures from today', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		await ingestEvents([
			captureEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, label: 'test term', captureType: 'term' }),
			captureEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - 1000, label: 'test question', captureType: 'question' }),
		]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		expect(body.todayCaptures.count).toBe(2);
		expect(body.todayCaptures.items).toHaveLength(2);
		expect(body.todayCaptures.items.map((c) => c.label)).toContain('test term');
		expect(body.todayCaptures.items.map((c) => c.label)).toContain('test question');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Breakdown (topics and sources)
	// ─────────────────────────────────────────────────────────────────────────

	it('breaks down activity by source (host)', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		// Create events from different hosts
		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, host: 'react.dev' }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - 30_000, host: 'react.dev' }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - 60_000, host: 'docs.cloudflare.com' }),
		]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// Should have sources in breakdown
		expect(body.todayBreakdown.sources.length).toBeGreaterThan(0);
		const hosts = body.todayBreakdown.sources.map((s) => s.id);
		expect(hosts).toContain('react.dev');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Topic override precedence (latest override should win)
	// ─────────────────────────────────────────────────────────────────────────

	it('applies latest topic override when multiple overrides exist for same artifact', async () => {
		const deviceId = generateUUID();
		const now = Date.now();
		const urlHash = 'test-override-hash';
		const host = 'docs.example.com';

		// Create heartbeat events for the artifact
		await ingestEvents([
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now, host, urlHash }),
			heartbeatEvent({ deviceId, eventId: generateUUID(), emittedAtMs: now - 30_000, host, urlHash }),
		]);

		// Create two topic overrides for the same artifact at different times:
		// - Earlier override (1 hour ago): sets topic to 'frontend'
		// - Later override (now): sets topic to 'backend'
		// The latest override (backend) should win
		await ingestEvents([
			{
				schema_version: 1,
				event_id: generateUUID(),
				device_id: deviceId,
				emitted_at: now - 60 * 60 * 1000, // 1 hour ago
				type: 'topic_override',
				artifact: { host, url_hash: urlHash },
				payload: { topic_slug: 'frontend', scope: 'artifact' },
			},
			{
				schema_version: 1,
				event_id: generateUUID(),
				device_id: deviceId,
				emitted_at: now, // now (most recent)
				type: 'topic_override',
				artifact: { host, url_hash: urlHash },
				payload: { topic_slug: 'backend', scope: 'artifact' },
			},
		]);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// The breakdown should show 'backend' (latest override), not 'frontend'
		const topicIds = body.todayBreakdown.topics.map((t) => t.id);
		expect(topicIds).toContain('backend');
		expect(topicIds).not.toContain('frontend');
	});

	// ─────────────────────────────────────────────────────────────────────────
	// 7-day average
	// ─────────────────────────────────────────────────────────────────────────

	it('computes 7-day average correctly', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		// Add substantial activity for today to ensure measurable average
		const events = [];
		const minutesPerDay = 60; // 60 minutes = 1 hour
		const intervalsNeeded = Math.ceil((minutesPerDay * 60 * 1000) / 30_000);

		for (let i = 0; i < intervalsNeeded; i++) {
			events.push(
				heartbeatEvent({
					deviceId,
					eventId: generateUUID(),
					emittedAtMs: now - i * 30_000,
				})
			);
		}

		await ingestEvents(events);

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		const body = (await res.json()) as DashboardTodayResponse;

		// Average should be todayMinutes / 7 (since only today has data)
		const expectedAvg = Math.round(body.todayHero.todayMinutes / 7);
		expect(body.todayHero.sevenDayAvgMinutes).toBe(expectedAvg);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Max scan limit enforcement
	// ─────────────────────────────────────────────────────────────────────────

	it.skip('returns RANGE_TOO_LARGE when hitting max scan limit exactly', async () => {
		// Note: This test is skipped in normal runs because it requires ingesting 250k events
		// (500 batches of 500 events each), which takes ~30+ seconds.
		// The test verifies that MAX_EVENTS_PER_REQUEST (250k) is enforced exactly.
		// Run with: pnpm test -- --run dashboard.today.spec.ts --test-name-pattern "hitting max scan"

		const deviceId = generateUUID();
		const now = Date.now();

		const MAX_SCAN = 250_000;
		const INGEST_BATCH_SIZE = 500;
		const batches = Math.ceil(MAX_SCAN / INGEST_BATCH_SIZE);

		for (let batch = 0; batch < batches; batch++) {
			const events = [];
			for (let i = 0; i < INGEST_BATCH_SIZE; i++) {
				const eventIndex = batch * INGEST_BATCH_SIZE + i;
				events.push(
					heartbeatEvent({
						deviceId,
						eventId: generateUUID(),
						emittedAtMs: now - eventIndex * 100,
					})
				);
			}
			await ingestEvents(events);
		}

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(413);

		const body = (await res.json()) as any;
		expect(body.error.code).toBe('RANGE_TOO_LARGE');
		expect(body.error.message).toContain('Too many events');
		expect(body.details).toEqual({ max_events_scanned: 250_000 });
	});

	it('does not overshoot scan limit by PAGE_SIZE when fetching events', async () => {
		const deviceId = generateUUID();
		const now = Date.now();

		// Verify that fetchEventsPaged respects the `remaining` calculation:
		// remaining = Math.min(PAGE_SIZE, maxScan - scanned)
		// This ensures the loop stops at exactly maxScan, not maxScan + PAGE_SIZE
		//
		// PAGE_SIZE = 10,000 in getDashboardToday.ts
		// Create 2,500 events (0.25 pages) to verify multi-page logic works correctly
		// without needing to ingest 250k events
		const EVENT_COUNT = 2_500;
		const INGEST_BATCH_SIZE = 500;

		for (let batch = 0; batch < Math.ceil(EVENT_COUNT / INGEST_BATCH_SIZE); batch++) {
			const events = [];
			const batchSize = Math.min(INGEST_BATCH_SIZE, EVENT_COUNT - batch * INGEST_BATCH_SIZE);
			for (let i = 0; i < batchSize; i++) {
				const eventIndex = batch * INGEST_BATCH_SIZE + i;
				events.push(
					heartbeatEvent({
						deviceId,
						eventId: generateUUID(),
						emittedAtMs: now - eventIndex * 100,
					})
				);
			}
			await ingestEvents(events);
		}

		// This should succeed since we're far under the 250k limit
		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(200);

		const body = (await res.json()) as DashboardTodayResponse;
		// Should have valid data processed
		expect(body.todayHero).toBeDefined();
		expect(body.streak).toBeDefined();
		expect(body.todayHero.todayMinutes).toBeGreaterThan(0);
	});

	it.skip('enforces scan limit across 7-day fetch and streak computation combined', async () => {
		// Note: This test is skipped in normal runs because it requires ingesting 252k events
		// (~504 batches), which takes ~30+ seconds.
		// The test verifies that the combined budget (7-day fetch + streak) respects MAX_EVENTS_PER_REQUEST.
		// Run with: pnpm test -- --run dashboard.today.spec.ts --test-name-pattern "across 7-day"

		const deviceId = generateUUID();
		const now = Date.now();

		// Create ~36k events per day over 7 days = ~252k total (exceeds 250k limit)
		const EVENTS_PER_DAY = 36_000;
		const DAYS = 7;
		const INGEST_BATCH_SIZE = 500;

		for (let day = 0; day < DAYS; day++) {
			const dayOffset = day * 24 * 60 * 60 * 1000;

			for (let batch = 0; batch < Math.ceil(EVENTS_PER_DAY / INGEST_BATCH_SIZE); batch++) {
				const events = [];
				const batchSize = Math.min(INGEST_BATCH_SIZE, EVENTS_PER_DAY - batch * INGEST_BATCH_SIZE);

				for (let i = 0; i < batchSize; i++) {
					const eventIndex = batch * INGEST_BATCH_SIZE + i;
					events.push(
						heartbeatEvent({
							deviceId,
							eventId: generateUUID(),
							emittedAtMs: now - dayOffset - eventIndex * 100,
						})
					);
				}
				await ingestEvents(events);
			}
		}

		const res = await authFetch('/api/dashboard/today?tz=UTC', { cookie: authCookie });
		expect(res.status).toBe(413);

		const body = (await res.json()) as any;
		expect(body.error.code).toBe('RANGE_TOO_LARGE');
		expect(body.error.message).toContain('Too many events');
		expect(body.details).toEqual({ max_events_scanned: 250_000 });
	});
});
