/**
 * Credit computation for artifact_active heartbeats.
 * Ported from web/src/features/dashboard/telemetry/rollups.ts.
 */

import { formatDayKey, isValidTimezone } from './time';
import { buildTopicOverrideIndex, resolveTopicForArtifact } from './topics';
import type { ActiveSignals, ArtifactActivePayload, CreditIndex, DbEventRow } from './types';

// Constants from docs/design.md
export const IDLE_CUTOFF_MS = 300_000; // 5 minutes
export const MIN_ACTIVE_MINUTES_FOR_STREAK = 10;

/**
 * Check if heartbeat signals indicate active state.
 */
export function isHeartbeatActive(active_signals: ActiveSignals): boolean {
	return !active_signals.user_idle && active_signals.window_focused && active_signals.tab_active;
}

/**
 * Compute credit for a single heartbeat based on gap from previous heartbeat.
 */
export function computeHeartbeatCreditMs(opts: {
	emitted_at: number;
	prev_emitted_at?: number;
	interval_ms: number;
	active_signals: ActiveSignals;
}): number {
	if (!isHeartbeatActive(opts.active_signals)) return 0;
	if (opts.prev_emitted_at == null) return opts.interval_ms;

	const gap = opts.emitted_at - opts.prev_emitted_at;
	if (gap <= IDLE_CUTOFF_MS) return Math.min(gap, opts.interval_ms);
	return opts.interval_ms; // new session
}

/**
 * Compute credit index from event rows.
 *
 * Important: The events should be pre-filtered to the user and time range,
 * but should include padding (fromMs - IDLE_CUTOFF_MS) so that the first
 * heartbeat in the actual range doesn't incorrectly get full interval_ms credit.
 *
 * @param rows - Event rows sorted by emitted_at ASC
 * @param timezone - IANA timezone for day key computation
 * @param windowStartMs - Start of the requested window (credits before this are not counted)
 * @param windowEndMs - End of the requested window (credits after this are not counted)
 */
export function computeCreditIndex(rows: DbEventRow[], timezone: string, windowStartMs?: number, windowEndMs?: number): CreditIndex {
	// Input validation
	if (!isValidTimezone(timezone)) {
		throw new Error(`Invalid timezone: ${timezone}. Must be a valid IANA timezone (e.g., "America/New_York").`);
	}

	if (windowStartMs != null && windowEndMs != null && windowStartMs > windowEndMs) {
		throw new Error(`Invalid window: windowStartMs (${windowStartMs}) must be <= windowEndMs (${windowEndMs}).`);
	}

	// Validate rows are sorted by emittedAt ASC
	for (let i = 1; i < rows.length; i++) {
		const prevTime = rows[i - 1].emittedAt.getTime();
		const currTime = rows[i].emittedAt.getTime();
		if (prevTime > currTime) {
			throw new Error(`Rows are not sorted by emittedAt. Row ${i - 1} (${prevTime}) > Row ${i} (${currTime}).`);
		}
	}

	// Validate all rows belong to the same user (defense-in-depth)
	if (rows.length > 0) {
		const firstUserId = rows[0].userId;
		for (let i = 1; i < rows.length; i++) {
			if (rows[i].userId !== firstUserId) {
				throw new Error(`All rows must belong to the same user. Found userId ${rows[i].userId} at row ${i}, expected ${firstUserId}.`);
			}
		}
	}

	const overridesByArtifact = buildTopicOverrideIndex(rows);

	// Filter to artifact_active events with artifacts
	const heartbeats = rows
		.filter((r) => r.type === 'artifact_active' && r.artifactHost && r.artifactUrlHash)
		.sort((a, b) => a.emittedAt.getTime() - b.emittedAt.getTime());

	const lastEmittedAtByArtifact = new Map<string, number>();
	const totalMsByDay = new Map<string, number>();
	const msByDayAndHost = new Map<string, number>();
	const msByDayAndTopic = new Map<string, number>();

	for (const hb of heartbeats) {
		// Note: host and urlHash are guaranteed non-null since we filtered for them above
		const host = hb.artifactHost as string;
		const urlHash = hb.artifactUrlHash as string;
		const artifactKey = `${host}:${urlHash}`;
		const emittedAtMs = hb.emittedAt.getTime();

		const prevEmittedAt = lastEmittedAtByArtifact.get(artifactKey);
		const payload = JSON.parse(hb.payloadJson) as ArtifactActivePayload;

		let creditMs = computeHeartbeatCreditMs({
			emitted_at: emittedAtMs,
			prev_emitted_at: prevEmittedAt,
			interval_ms: payload.interval_ms,
			active_signals: payload.active_signals,
		});

		lastEmittedAtByArtifact.set(artifactKey, emittedAtMs);

		// Clamp credit to window boundary when previous heartbeat was before window.
		// This prevents time from prior periods bleeding into current window totals.
		if (windowStartMs != null && prevEmittedAt != null && prevEmittedAt < windowStartMs) {
			const maxCreditInWindow = emittedAtMs - windowStartMs;
			creditMs = Math.min(creditMs, maxCreditInWindow);
		}

		// Skip if no credit or if outside the requested window
		if (creditMs <= 0) continue;
		if (windowStartMs != null && emittedAtMs < windowStartMs) continue;
		if (windowEndMs != null && emittedAtMs > windowEndMs) continue;

		const dayKey = formatDayKey(emittedAtMs, timezone);

		// Accumulate totals
		totalMsByDay.set(dayKey, (totalMsByDay.get(dayKey) ?? 0) + creditMs);

		const hostKey = `${dayKey}|${host}`;
		msByDayAndHost.set(hostKey, (msByDayAndHost.get(hostKey) ?? 0) + creditMs);

		const topic = resolveTopicForArtifact({
			host,
			artifactKey,
			emitted_at: emittedAtMs,
			overridesByArtifact,
		});
		const topicKey = `${dayKey}|${topic}`;
		msByDayAndTopic.set(topicKey, (msByDayAndTopic.get(topicKey) ?? 0) + creditMs);
	}

	return { totalMsByDay, msByDayAndHost, msByDayAndTopic };
}

/**
 * Convert milliseconds to rounded minutes.
 */
export function msToMinutes(ms: number): number {
	return Math.round(ms / 60_000);
}
