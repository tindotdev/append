/**
 * Per-user suggestion quota enforcement (ADR 0026).
 *
 * Each user gets 3 term suggestions for their account lifetime.
 * Quota is enforced via atomic D1 UPDATE with WHERE guard.
 */

import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, userSuggestionQuota } from '../../db';

/** Maximum lifetime suggestions per user (ADR 0026) */
export const USER_SUGGESTION_LIMIT = 3;

export type UserQuotaStatus = {
	used: number;
	limit: number;
	remaining: number;
};

export type UserQuotaCheckResult = { ok: true; status: UserQuotaStatus } | { ok: false; error: 'quota_exceeded'; status: UserQuotaStatus };

export type UserQuotaConsumeResult =
	| { ok: true; status: UserQuotaStatus }
	| { ok: false; error: 'quota_exceeded'; status: UserQuotaStatus };

/**
 * Check user's current suggestion quota status without consuming.
 * Creates quota record if it doesn't exist.
 */
export async function checkUserQuota(db: DrizzleD1Database<typeof schema>, userId: string): Promise<UserQuotaCheckResult> {
	const nowMs = Date.now();

	// Ensure quota row exists (upsert)
	await db
		.insert(userSuggestionQuota)
		.values({
			userId,
			lifetimeUsedCount: 0,
			createdAtMs: nowMs,
			updatedAtMs: nowMs,
		})
		.onConflictDoNothing();

	// Fetch current quota
	const quota = await db.query.userSuggestionQuota.findFirst({
		where: eq(userSuggestionQuota.userId, userId),
	});

	const used = quota?.lifetimeUsedCount ?? 0;
	const status: UserQuotaStatus = {
		used,
		limit: USER_SUGGESTION_LIMIT,
		remaining: Math.max(0, USER_SUGGESTION_LIMIT - used),
	};

	if (used >= USER_SUGGESTION_LIMIT) {
		return { ok: false, error: 'quota_exceeded', status };
	}

	return { ok: true, status };
}

/**
 * Atomically consume one suggestion from user's quota.
 * Returns success only if quota was available and consumed.
 *
 * Uses D1's single-statement UPDATE with WHERE guard for concurrency safety.
 * If two requests race, only one will succeed (affected rows = 1).
 */
export async function consumeUserQuota(db: DrizzleD1Database<typeof schema>, userId: string): Promise<UserQuotaConsumeResult> {
	const nowMs = Date.now();

	// Ensure quota row exists first
	await db
		.insert(userSuggestionQuota)
		.values({
			userId,
			lifetimeUsedCount: 0,
			createdAtMs: nowMs,
			updatedAtMs: nowMs,
		})
		.onConflictDoNothing();

	// Atomic increment with guard
	const result = await db
		.update(userSuggestionQuota)
		.set({
			lifetimeUsedCount: sql`${userSuggestionQuota.lifetimeUsedCount} + 1`,
			lastUsedAtMs: nowMs,
			updatedAtMs: nowMs,
		})
		.where(and(eq(userSuggestionQuota.userId, userId), lt(userSuggestionQuota.lifetimeUsedCount, USER_SUGGESTION_LIMIT)))
		.returning({ newCount: userSuggestionQuota.lifetimeUsedCount });

	// Check if update succeeded (affected rows > 0)
	if (result.length === 0) {
		// Quota was already exhausted or concurrent request won
		const quota = await db.query.userSuggestionQuota.findFirst({
			where: eq(userSuggestionQuota.userId, userId),
		});

		const used = quota?.lifetimeUsedCount ?? USER_SUGGESTION_LIMIT;
		console.warn('[quota] User suggestion quota exhausted', {
			userId,
			used,
			limit: USER_SUGGESTION_LIMIT,
		});
		return {
			ok: false,
			error: 'quota_exceeded',
			status: {
				used,
				limit: USER_SUGGESTION_LIMIT,
				remaining: 0,
			},
		};
	}

	const newCount = result[0].newCount;
	const status = {
		used: newCount,
		limit: USER_SUGGESTION_LIMIT,
		remaining: Math.max(0, USER_SUGGESTION_LIMIT - newCount),
	};
	console.log('[quota] User quota consumed', {
		userId,
		newUsed: status.used,
		limit: status.limit,
		remaining: status.remaining,
	});
	return {
		ok: true,
		status,
	};
}

/**
 * Get user's current quota status (read-only, no side effects).
 */
export async function getUserQuotaStatus(db: DrizzleD1Database<typeof schema>, userId: string): Promise<UserQuotaStatus> {
	const quota = await db.query.userSuggestionQuota.findFirst({
		where: eq(userSuggestionQuota.userId, userId),
	});

	const used = quota?.lifetimeUsedCount ?? 0;
	return {
		used,
		limit: USER_SUGGESTION_LIMIT,
		remaining: Math.max(0, USER_SUGGESTION_LIMIT - used),
	};
}

/**
 * Best-effort refund of one consumed suggestion from a user's lifetime quota.
 *
 * This should only be used to undo a preflight consumption when the request cannot proceed
 * (e.g. global budget consume fails after a successful user quota consume).
 *
 * Not intended to refund after an LLM call attempt (ADR 0026: no refunds for provider failures).
 */
export async function refundUserQuota(db: DrizzleD1Database<typeof schema>, userId: string): Promise<void> {
	const nowMs = Date.now();

	const result = await db
		.update(userSuggestionQuota)
		.set({
			lifetimeUsedCount: sql`${userSuggestionQuota.lifetimeUsedCount} - 1`,
			updatedAtMs: nowMs,
		})
		.where(and(eq(userSuggestionQuota.userId, userId), gt(userSuggestionQuota.lifetimeUsedCount, 0)))
		.returning({ newCount: userSuggestionQuota.lifetimeUsedCount });

	if (result.length === 0) {
		console.warn('[quota] User quota refund noop', { userId });
		return;
	}

	console.log('[quota] User quota refunded', { userId, newUsed: result[0].newCount });
}
