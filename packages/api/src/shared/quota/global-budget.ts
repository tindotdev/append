/**
 * Global LLM budget enforcement (ADR 0026).
 *
 * Monthly budget pool for term suggestions:
 * - shared pool: 100/month (usable by all users)
 * - reserved pool: 100/month (usable only by admin when shared is exhausted)
 *
 * Uses atomic D1 UPDATE with WHERE guard for concurrency safety.
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { account, llmBudget, type schema } from '../../db';
import { formatResetTime, getNextWindowResetMs, getUtcMonthWindow, isWindowExpired } from './window';

/** Feature key for term suggestions */
export const FEATURE_TERM_SUGGESTION = 'term_suggestion';

/** Default budget limits (ADR 0026) */
export const DEFAULT_SHARED_LIMIT = 100;
export const DEFAULT_RESERVED_LIMIT = 100;

/** Circuit breaker duration in ms (15 minutes) */
export const CIRCUIT_BREAKER_DURATION_MS = 15 * 60 * 1000;

export type BudgetStatus = {
	sharedUsed: number;
	sharedLimit: number;
	sharedRemaining: number;
	reservedUsed: number;
	reservedLimit: number;
	reservedRemaining: number;
	resetAt: string; // ISO 8601
	disabled: boolean;
	disabledUntil: string | null; // ISO 8601 or null
};

export type BudgetCheckResult =
	| { ok: true; status: BudgetStatus }
	| { ok: false; error: 'budget_exhausted'; status: BudgetStatus }
	| { ok: false; error: 'circuit_breaker_open'; status: BudgetStatus };

export type BudgetConsumeResult =
	| { ok: true; pool: 'shared' | 'reserved'; status: BudgetStatus }
	| { ok: false; error: 'budget_exhausted'; status: BudgetStatus }
	| { ok: false; error: 'circuit_breaker_open'; status: BudgetStatus };

/**
 * Initialize the global budget row if it doesn't exist.
 * Also handles monthly window rotation.
 */
export async function ensureBudgetRow(
	db: DrizzleD1Database<typeof schema>,
	nowMs: number = Date.now()
): Promise<typeof llmBudget.$inferSelect> {
	const { windowStartMs, windowMs } = getUtcMonthWindow(nowMs);

	// Try to insert (will no-op if exists)
	await db
		.insert(llmBudget)
		.values({
			feature: FEATURE_TERM_SUGGESTION,
			windowStartMs,
			windowMs,
			sharedUsedCount: 0,
			sharedLimitCount: DEFAULT_SHARED_LIMIT,
			reservedUsedCount: 0,
			reservedLimitCount: DEFAULT_RESERVED_LIMIT,
			disabledUntilMs: null,
			updatedAtMs: nowMs,
		})
		.onConflictDoNothing();

	// Fetch current row
	let budget = await db.query.llmBudget.findFirst({
		where: eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
	});

	if (!budget) {
		throw new Error('Failed to initialize llm_budget row');
	}

	// Check if window has expired and needs rotation
	if (isWindowExpired(budget.windowStartMs, budget.windowMs, nowMs)) {
		const { windowStartMs: newWindowStart, windowMs: newWindowMs } = getUtcMonthWindow(nowMs);

		await db
			.update(llmBudget)
			.set({
				windowStartMs: newWindowStart,
				windowMs: newWindowMs,
				sharedUsedCount: 0,
				reservedUsedCount: 0,
				disabledUntilMs: null,
				updatedAtMs: nowMs,
			})
			.where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));

		// Re-fetch after rotation
		budget = await db.query.llmBudget.findFirst({
			where: eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
		});

		if (!budget) {
			throw new Error('Failed to rotate llm_budget window');
		}
	}

	return budget;
}

/**
 * Build status object from budget row.
 */
function buildStatus(budget: typeof llmBudget.$inferSelect, nowMs: number): BudgetStatus {
	const resetMs = getNextWindowResetMs(budget.windowStartMs, budget.windowMs);
	const disabled = budget.disabledUntilMs !== null && budget.disabledUntilMs > nowMs;

	return {
		sharedUsed: budget.sharedUsedCount,
		sharedLimit: budget.sharedLimitCount,
		sharedRemaining: Math.max(0, budget.sharedLimitCount - budget.sharedUsedCount),
		reservedUsed: budget.reservedUsedCount,
		reservedLimit: budget.reservedLimitCount,
		reservedRemaining: Math.max(0, budget.reservedLimitCount - budget.reservedUsedCount),
		resetAt: formatResetTime(resetMs),
		disabled,
		disabledUntil: disabled && budget.disabledUntilMs ? formatResetTime(budget.disabledUntilMs) : null,
	};
}

/**
 * Check global budget availability without consuming.
 * Handles window rotation and circuit breaker state.
 */
export async function checkGlobalBudget(db: DrizzleD1Database<typeof schema>, isAdmin: boolean): Promise<BudgetCheckResult> {
	const nowMs = Date.now();
	const budget = await ensureBudgetRow(db, nowMs);
	const status = buildStatus(budget, nowMs);

	// Check circuit breaker
	if (status.disabled) {
		return { ok: false, error: 'circuit_breaker_open', status };
	}

	// Check if any quota is available
	const sharedAvailable = budget.sharedUsedCount < budget.sharedLimitCount;
	const reservedAvailable = isAdmin && budget.reservedUsedCount < budget.reservedLimitCount;

	if (!sharedAvailable && !reservedAvailable) {
		return { ok: false, error: 'budget_exhausted', status };
	}

	return { ok: true, status };
}

/**
 * Atomically consume one suggestion from the global budget.
 *
 * Consumption order (ADR 0026):
 * 1. Try shared pool first (all users)
 * 2. If shared exhausted AND user is admin, try reserved pool
 *
 * Uses D1's single-statement UPDATE with WHERE guard for concurrency safety.
 */
export async function consumeGlobalBudget(db: DrizzleD1Database<typeof schema>, isAdmin: boolean): Promise<BudgetConsumeResult> {
	const nowMs = Date.now();
	let budget = await ensureBudgetRow(db, nowMs);
	let status = buildStatus(budget, nowMs);

	// Check circuit breaker
	if (status.disabled) {
		return { ok: false, error: 'circuit_breaker_open', status };
	}

	const tryConsumeOnce = async (row: typeof llmBudget.$inferSelect): Promise<BudgetConsumeResult | null> => {
		let attemptStatus = buildStatus(row, nowMs);

		// Circuit breaker may have changed since initial read (rare, but cheap to check)
		if (attemptStatus.disabled) {
			return { ok: false, error: 'circuit_breaker_open', status: attemptStatus };
		}

		// Try shared pool first
		const sharedResult = await db
			.update(llmBudget)
			.set({
				sharedUsedCount: sql`${llmBudget.sharedUsedCount} + 1`,
				updatedAtMs: nowMs,
			})
			.where(
				and(
					eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
					eq(llmBudget.windowStartMs, row.windowStartMs),
					lt(llmBudget.sharedUsedCount, llmBudget.sharedLimitCount)
				)
			)
			.returning({
				sharedUsedCount: llmBudget.sharedUsedCount,
				reservedUsedCount: llmBudget.reservedUsedCount,
			});

		if (sharedResult.length > 0) {
			// Shared pool consumption succeeded
			const updated = sharedResult[0];
			attemptStatus = {
				...attemptStatus,
				sharedUsed: updated.sharedUsedCount,
				sharedRemaining: Math.max(0, row.sharedLimitCount - updated.sharedUsedCount),
			};
			return { ok: true, pool: 'shared', status: attemptStatus };
		}

		// Shared pool exhausted - try reserved if admin
		if (isAdmin) {
			const reservedResult = await db
				.update(llmBudget)
				.set({
					reservedUsedCount: sql`${llmBudget.reservedUsedCount} + 1`,
					updatedAtMs: nowMs,
				})
				.where(
					and(
						eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
						eq(llmBudget.windowStartMs, row.windowStartMs),
						lt(llmBudget.reservedUsedCount, llmBudget.reservedLimitCount)
					)
				)
				.returning({
					sharedUsedCount: llmBudget.sharedUsedCount,
					reservedUsedCount: llmBudget.reservedUsedCount,
				});

			if (reservedResult.length > 0) {
				// Reserved pool consumption succeeded
				const updated = reservedResult[0];
				attemptStatus = {
					...attemptStatus,
					reservedUsed: updated.reservedUsedCount,
					reservedRemaining: Math.max(0, row.reservedLimitCount - updated.reservedUsedCount),
				};
				return { ok: true, pool: 'reserved', status: attemptStatus };
			}
		}

		return null;
	};

	const firstAttempt = await tryConsumeOnce(budget);
	if (firstAttempt) {
		return firstAttempt;
	}

	// Rollover edge: another request may have rotated the month window between our read and guarded UPDATE.
	// If windowStart changed, retry once against the current row to avoid spurious 429s during rollover.
	const currentBudget = await db.query.llmBudget.findFirst({
		where: eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
	});

	if (currentBudget && currentBudget.windowStartMs !== budget.windowStartMs) {
		budget = currentBudget;
		const retryAttempt = await tryConsumeOnce(currentBudget);
		if (retryAttempt) {
			return retryAttempt;
		}
		status = buildStatus(currentBudget, nowMs);
	} else if (currentBudget) {
		status = buildStatus(currentBudget, nowMs);
	}

	// Both pools exhausted (or user is not admin and shared is exhausted)
	// Re-fetch to get accurate status
	if (!currentBudget) {
		const finalBudget = await db.query.llmBudget.findFirst({
			where: eq(llmBudget.feature, FEATURE_TERM_SUGGESTION),
		});
		if (finalBudget) {
			status = buildStatus(finalBudget, nowMs);
		}
	}

	console.warn('[quota] Global budget exhausted', {
		feature: FEATURE_TERM_SUGGESTION,
		isAdmin,
		sharedUsed: status.sharedUsed,
		sharedLimit: status.sharedLimit,
		reservedUsed: status.reservedUsed,
		reservedLimit: status.reservedLimit,
		resetAt: status.resetAt,
	});

	return { ok: false, error: 'budget_exhausted', status };
}

/**
 * Trip the circuit breaker (called when provider returns 429 or error).
 * Disables suggestions for CIRCUIT_BREAKER_DURATION_MS.
 */
export async function tripCircuitBreaker(db: DrizzleD1Database<typeof schema>): Promise<void> {
	const nowMs = Date.now();
	const disabledUntilMs = nowMs + CIRCUIT_BREAKER_DURATION_MS;

	console.warn('[quota] Circuit breaker tripped', {
		feature: FEATURE_TERM_SUGGESTION,
		disabledUntilMs,
		disabledUntilIso: new Date(disabledUntilMs).toISOString(),
		durationMs: CIRCUIT_BREAKER_DURATION_MS,
	});

	await db
		.update(llmBudget)
		.set({
			disabledUntilMs,
			updatedAtMs: nowMs,
		})
		.where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));
}

/**
 * Reset the circuit breaker (for manual recovery).
 */
export async function resetCircuitBreaker(db: DrizzleD1Database<typeof schema>): Promise<void> {
	const nowMs = Date.now();

	await db
		.update(llmBudget)
		.set({
			disabledUntilMs: null,
			updatedAtMs: nowMs,
		})
		.where(eq(llmBudget.feature, FEATURE_TERM_SUGGESTION));
}

/**
 * Get current budget status. May trigger window rotation if expired, which resets counters.
 */
export async function getGlobalBudgetStatus(db: DrizzleD1Database<typeof schema>): Promise<BudgetStatus> {
	const nowMs = Date.now();
	const budget = await ensureBudgetRow(db, nowMs);
	return buildStatus(budget, nowMs);
}

/**
 * Check if a user is an admin based on their Google sub.
 * Looks up the user's Google OAuth account and compares to ADMIN_SUB.
 */
export async function isUserAdmin(db: DrizzleD1Database<typeof schema>, userId: string, adminSub: string | undefined): Promise<boolean> {
	if (!adminSub) {
		return false;
	}

	// Find user's Google account
	const googleAccount = await db.query.account.findFirst({
		where: and(eq(account.userId, userId), eq(account.providerId, 'google')),
		columns: { accountId: true },
	});

	if (!googleAccount) {
		return false;
	}

	return googleAccount.accountId === adminSub;
}
