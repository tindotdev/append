import { describe, expect, it } from 'vitest';
import {
	computeCreditIndex,
	computeHeartbeatCreditMs,
	IDLE_CUTOFF_MS,
	isHeartbeatActive,
	msToMinutes,
} from '../src/features/dashboard/rollups/credit';
import type { DbEventRow } from '../src/features/dashboard/rollups/types';

describe('credit utilities', () => {
	describe('isHeartbeatActive', () => {
		it('returns true when all signals are active', () => {
			expect(isHeartbeatActive({ user_idle: false, window_focused: true, tab_active: true })).toBe(true);
		});

		it('returns false when user is idle', () => {
			expect(isHeartbeatActive({ user_idle: true, window_focused: true, tab_active: true })).toBe(false);
		});

		it('returns false when window is not focused', () => {
			expect(isHeartbeatActive({ user_idle: false, window_focused: false, tab_active: true })).toBe(false);
		});

		it('returns false when tab is not active', () => {
			expect(isHeartbeatActive({ user_idle: false, window_focused: true, tab_active: false })).toBe(false);
		});
	});

	describe('computeHeartbeatCreditMs', () => {
		const activeSignals = { user_idle: false, window_focused: true, tab_active: true };
		const inactiveSignals = { user_idle: true, window_focused: true, tab_active: true };

		it('returns interval_ms for first heartbeat', () => {
			const credit = computeHeartbeatCreditMs({
				emitted_at: 1000,
				prev_emitted_at: undefined,
				interval_ms: 30000,
				active_signals: activeSignals,
			});
			expect(credit).toBe(30000);
		});

		it('returns 0 for inactive heartbeat', () => {
			const credit = computeHeartbeatCreditMs({
				emitted_at: 1000,
				prev_emitted_at: undefined,
				interval_ms: 30000,
				active_signals: inactiveSignals,
			});
			expect(credit).toBe(0);
		});

		it('returns gap when gap is less than interval_ms', () => {
			const credit = computeHeartbeatCreditMs({
				emitted_at: 20000,
				prev_emitted_at: 0,
				interval_ms: 30000,
				active_signals: activeSignals,
			});
			expect(credit).toBe(20000);
		});

		it('returns interval_ms when gap is less than IDLE_CUTOFF but greater than interval_ms', () => {
			const credit = computeHeartbeatCreditMs({
				emitted_at: 60000,
				prev_emitted_at: 0,
				interval_ms: 30000,
				active_signals: activeSignals,
			});
			expect(credit).toBe(30000);
		});

		it('returns interval_ms when gap exceeds IDLE_CUTOFF (new session)', () => {
			const credit = computeHeartbeatCreditMs({
				emitted_at: IDLE_CUTOFF_MS + 1000,
				prev_emitted_at: 0,
				interval_ms: 30000,
				active_signals: activeSignals,
			});
			expect(credit).toBe(30000);
		});
	});

	describe('computeCreditIndex', () => {
		const makeHeartbeatRow = (
			emittedAtMs: number,
			host: string,
			urlHash: string,
			intervalMs: number = 30000,
			active: boolean = true
		): DbEventRow => ({
			userId: 'user-1',
			deviceId: 'device-1',
			eventId: `event-${emittedAtMs}-${urlHash}`,
			schemaVersion: 1,
			type: 'artifact_active',
			emittedAt: new Date(emittedAtMs),
			receivedAt: new Date(emittedAtMs + 100),
			artifactHost: host,
			artifactUrlHash: urlHash,
			artifactPathHint: null,
			titleHint: null,
			payloadJson: JSON.stringify({
				interval_ms: intervalMs,
				active_signals: {
					user_idle: !active,
					window_focused: true,
					tab_active: true,
				},
			}),
		});

		it('computes credit for single heartbeat', () => {
			const rows = [makeHeartbeatRow(Date.UTC(2026, 0, 15, 10, 0, 0), 'example.com', 'hash1')];
			const index = computeCreditIndex(rows, 'UTC');

			expect(index.totalMsByDay.get('2026-01-15')).toBe(30000);
			expect(index.msByDayAndHost.get('2026-01-15|example.com')).toBe(30000);
		});

		it('computes credit for consecutive heartbeats', () => {
			const rows = [
				makeHeartbeatRow(Date.UTC(2026, 0, 15, 10, 0, 0), 'example.com', 'hash1'),
				makeHeartbeatRow(Date.UTC(2026, 0, 15, 10, 0, 30), 'example.com', 'hash1'), // 30s later
				makeHeartbeatRow(Date.UTC(2026, 0, 15, 10, 1, 0), 'example.com', 'hash1'), // 30s later
			];
			const index = computeCreditIndex(rows, 'UTC');

			// First heartbeat: 30000ms (interval)
			// Second heartbeat: 30000ms (gap)
			// Third heartbeat: 30000ms (gap)
			expect(index.totalMsByDay.get('2026-01-15')).toBe(90000);
		});

		it('skips credit for inactive heartbeats', () => {
			const rows = [
				makeHeartbeatRow(Date.UTC(2026, 0, 15, 10, 0, 0), 'example.com', 'hash1', 30000, true),
				makeHeartbeatRow(Date.UTC(2026, 0, 15, 10, 0, 30), 'example.com', 'hash1', 30000, false), // inactive
				makeHeartbeatRow(Date.UTC(2026, 0, 15, 10, 1, 0), 'example.com', 'hash1', 30000, true),
			];
			const index = computeCreditIndex(rows, 'UTC');

			// First heartbeat: 30000ms
			// Second heartbeat: 0 (inactive)
			// Third heartbeat: 30000ms (gap from last heartbeat, capped at interval)
			expect(index.totalMsByDay.get('2026-01-15')).toBe(60000);
		});

		describe('window boundary clamping', () => {
			it('clamps credit when gap-based credit exceeds window portion', () => {
				// Use a 5-minute interval to demonstrate the clamping effect
				// Scenario: Window starts at 08:00, prev heartbeat at 07:57, current at 08:02
				// Gap = 5 minutes, interval = 5 minutes, so base credit = 5 minutes
				// But only 2 minutes are within window, so should clamp to 2 minutes
				const windowStartMs = Date.UTC(2026, 0, 15, 8, 0, 0); // 08:00
				const windowEndMs = Date.UTC(2026, 0, 15, 23, 59, 59, 999);
				const intervalMs = 5 * 60 * 1000; // 5 minutes

				const rows = [
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 7, 57, 0), 'example.com', 'hash1', intervalMs), // 3 min before window
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 2, 0), 'example.com', 'hash1', intervalMs), // 2 min after window start
				];

				const index = computeCreditIndex(rows, 'UTC', windowStartMs, windowEndMs);

				// Without clamping: gap = 5min, credit = min(5min, 5min) = 5min
				// With clamping: maxCreditInWindow = 2min, credit = min(5min, 2min) = 2min
				const creditMs = index.totalMsByDay.get('2026-01-15') ?? 0;
				expect(creditMs).toBe(2 * 60 * 1000); // 2 minutes
			});

			it('does not clamp when interval_ms is already smaller than window portion', () => {
				// With small interval (30s), the interval cap applies before window clamping
				const windowStartMs = Date.UTC(2026, 0, 15, 8, 0, 0);
				const windowEndMs = Date.UTC(2026, 0, 15, 23, 59, 59, 999);

				const rows = [
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 7, 58, 0), 'example.com', 'hash1'), // 2 min before window
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 1, 0), 'example.com', 'hash1'), // 1 min after window start
				];

				const index = computeCreditIndex(rows, 'UTC', windowStartMs, windowEndMs);

				// Gap = 3 min, interval = 30s, so credit = min(3min, 30s) = 30s
				// Window portion = 1 min, so clamp = min(30s, 1min) = 30s (unchanged)
				const creditMs = index.totalMsByDay.get('2026-01-15') ?? 0;
				expect(creditMs).toBe(30000); // 30 seconds
			});

			it('handles heartbeat just after midnight correctly', () => {
				// This is the specific case from the PR review:
				// A heartbeat at 00:00:30 (30s after midnight) with large interval
				const windowStartMs = Date.UTC(2026, 0, 15, 0, 0, 0); // Midnight
				const windowEndMs = Date.UTC(2026, 0, 15, 23, 59, 59, 999);
				const intervalMs = 5 * 60 * 1000; // 5 minutes

				const rows = [
					// Heartbeat from previous day (23:58:00 on Jan 14)
					makeHeartbeatRow(Date.UTC(2026, 0, 14, 23, 58, 0), 'example.com', 'hash1', intervalMs),
					// Heartbeat just after midnight (00:00:30 on Jan 15)
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 0, 0, 30), 'example.com', 'hash1', intervalMs),
				];

				const index = computeCreditIndex(rows, 'UTC', windowStartMs, windowEndMs);

				// Gap = 2.5 min, interval = 5 min, so base credit = 2.5 min
				// Window portion = 30s, so clamped credit = min(2.5min, 30s) = 30s
				const creditMs = index.totalMsByDay.get('2026-01-15') ?? 0;
				expect(creditMs).toBe(30000); // 30 seconds, not 2.5 minutes
			});

			it('clamps to zero when heartbeat is exactly at window start', () => {
				const windowStartMs = Date.UTC(2026, 0, 15, 8, 0, 0);
				const windowEndMs = Date.UTC(2026, 0, 15, 23, 59, 59, 999);
				const intervalMs = 5 * 60 * 1000;

				const rows = [
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 7, 58, 0), 'example.com', 'hash1', intervalMs),
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 0, 0), 'example.com', 'hash1', intervalMs), // Exactly at window start
				];

				const index = computeCreditIndex(rows, 'UTC', windowStartMs, windowEndMs);

				// Gap = 2 min, interval = 5 min, so base credit = 2 min
				// Window portion = 0, so clamped credit = min(2min, 0) = 0
				const creditMs = index.totalMsByDay.get('2026-01-15') ?? 0;
				expect(creditMs).toBe(0);
			});

			it('handles multiple artifacts with different boundary conditions', () => {
				const windowStartMs = Date.UTC(2026, 0, 15, 8, 0, 0);
				const windowEndMs = Date.UTC(2026, 0, 15, 23, 59, 59, 999);
				const intervalMs = 5 * 60 * 1000; // 5 minutes

				const rows = [
					// Artifact 1: pre-window heartbeat, then 2 min after window start
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 7, 57, 0), 'example.com', 'hash1', intervalMs),
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 2, 0), 'example.com', 'hash1', intervalMs),
					// Artifact 2: first heartbeat is within window
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 3, 0), 'other.com', 'hash2', intervalMs),
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 5, 0), 'other.com', 'hash2', intervalMs),
				];

				const index = computeCreditIndex(rows, 'UTC', windowStartMs, windowEndMs);

				// Artifact 1: gap = 5min, but window portion = 2min, so clamped to 2min
				// Artifact 2: first = 5min (interval), second = 2min gap = 2min
				// Total = 2min + 5min + 2min = 9min
				const creditMs = index.totalMsByDay.get('2026-01-15') ?? 0;
				expect(creditMs).toBe(9 * 60 * 1000); // 9 minutes
			});

			it('does not clamp when previous heartbeat is within window', () => {
				const windowStartMs = Date.UTC(2026, 0, 15, 8, 0, 0);
				const windowEndMs = Date.UTC(2026, 0, 15, 23, 59, 59, 999);
				const intervalMs = 5 * 60 * 1000;

				const rows = [
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 1, 0), 'example.com', 'hash1', intervalMs), // Within window
					makeHeartbeatRow(Date.UTC(2026, 0, 15, 8, 3, 0), 'example.com', 'hash1', intervalMs), // 2 min later
				];

				const index = computeCreditIndex(rows, 'UTC', windowStartMs, windowEndMs);

				// First heartbeat: 5min (interval, first in artifact)
				// Second heartbeat: 2min (gap)
				const creditMs = index.totalMsByDay.get('2026-01-15') ?? 0;
				expect(creditMs).toBe(7 * 60 * 1000); // 7 minutes total
			});
		});
	});

	describe('msToMinutes', () => {
		it('converts milliseconds to rounded minutes', () => {
			expect(msToMinutes(60000)).toBe(1);
			expect(msToMinutes(90000)).toBe(2); // rounds up
			expect(msToMinutes(89999)).toBe(1); // rounds down
		});
	});
});
