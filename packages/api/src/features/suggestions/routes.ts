/**
 * Suggestions routes: generate suggestions for batch candidates.
 *
 * Quota enforcement (ADR 0026):
 * 1. Kill switch (SUGGESTIONS_ENABLED)
 * 2. Global budget pool (shared + reserved)
 * 3. Per-user lifetime quota (3 requests)
 */

import { vValidator } from '@hono/valibot-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bucket } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { sseEvent, sseResponse } from '../../platform/sse';
import { apiError, apiErrorFrom, ownershipErrorMap, validationHook } from '../../shared/api-error';
import { requireBatchOwned } from '../../shared/queries';
import {
	checkGlobalBudget,
	checkUserQuota,
	consumeGlobalBudget,
	consumeUserQuota,
	isUserAdmin,
	tripCircuitBreaker,
} from '../../shared/quota';
import { createLlmClient } from './adapters';
import { generateSuggestions } from './usecases/generateSuggestions';
import { SuggestSchema } from './validation/suggest.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const batchAccessErrors = ownershipErrorMap('Batch');

/**
 * Suggestions routes - exported as the result of route chain for Hono RPC type inference.
 *
 * POST /api/batch/:id/suggest - Generate suggestions with SSE streaming
 *
 * Note: This endpoint returns an SSE stream, not JSON.
 * Hono RPC type inference works for the input, but output type is Response.
 */
export const suggestionsRoutes = app.post('/batch/:id/suggest', vValidator('query', SuggestSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const batchId = c.req.param('id');
	const db = c.get('db');
	const query = c.req.valid('query');

	const { limit, regenerate } = query;
	const mode = regenerate ? 'regenerate' : 'fill-missing';

	// 1. Check kill switch (SUGGESTIONS_ENABLED)
	if (c.env.SUGGESTIONS_ENABLED === '0') {
		return apiError(c, 503, 'SUGGESTIONS_DISABLED', 'Suggestions are temporarily disabled');
	}

	// Create LLM client (async due to Secrets Store)
	const llm = await createLlmClient(c.env);
	if (!llm) {
		return apiError(c, 503, 'SERVICE_UNAVAILABLE', 'Suggestions are disabled');
	}

	// 2. Check if user is admin (for reserved pool access)
	const isAdmin = await isUserAdmin(db, userId, c.env.ADMIN_SUB);

	// 3. Check global budget (circuit breaker + pool capacity)
	const budgetCheck = await checkGlobalBudget(db, isAdmin);
	if (!budgetCheck.ok) {
		if (budgetCheck.error === 'circuit_breaker_open') {
			return apiError(c, 503, 'SERVICE_UNAVAILABLE', 'Suggestions are temporarily unavailable', {
				retry_after: budgetCheck.status.disabledUntil,
			});
		}
		// budget_exhausted
		return apiError(
			c,
			429,
			'SUGGESTIONS_BUDGET_EXHAUSTED',
			'Suggestion budget temporarily exhausted. Try again after the next monthly reset.',
			{
				reset_at: budgetCheck.status.resetAt,
			}
		);
	}

	// 4. Check per-user lifetime quota
	const userQuotaCheck = await checkUserQuota(db, userId);
	if (!userQuotaCheck.ok) {
		return apiError(
			c,
			429,
			'SUGGESTIONS_QUOTA_EXCEEDED',
			`You have used all ${userQuotaCheck.status.limit} lifetime suggestions for your account`,
			{
				quota: userQuotaCheck.status,
			}
		);
	}

	// 5. Verify batch exists and user owns it
	const batchOwnership = await requireBatchOwned(db, userId, batchId);
	if (!batchOwnership.ok) {
		return apiErrorFrom(c, { type: batchOwnership.error }, batchAccessErrors);
	}

	// 6. Fetch user's buckets for dynamic prompt
	const userBuckets = await db
		.select({ slug: bucket.slug, description: bucket.description })
		.from(bucket)
		.where(eq(bucket.userId, userId))
		.orderBy(bucket.order);

	if (userBuckets.length === 0) {
		return apiError(c, 400, 'VALIDATION_ERROR', 'No buckets configured. Please add at least one bucket.');
	}

	// 7. Atomically consume quota (global budget + user quota)
	// Do this BEFORE starting the LLM calls to prevent races
	const budgetConsume = await consumeGlobalBudget(db, isAdmin);
	if (!budgetConsume.ok) {
		// Race condition: budget was exhausted between check and consume
		if (budgetConsume.error === 'circuit_breaker_open') {
			return apiError(c, 503, 'SERVICE_UNAVAILABLE', 'Suggestions are temporarily unavailable', {
				retry_after: budgetConsume.status.disabledUntil,
			});
		}
		return apiError(
			c,
			429,
			'SUGGESTIONS_BUDGET_EXHAUSTED',
			'Suggestion budget temporarily exhausted. Try again after the next monthly reset.',
			{
				reset_at: budgetConsume.status.resetAt,
			}
		);
	}

	const userQuotaConsume = await consumeUserQuota(db, userId);
	if (!userQuotaConsume.ok) {
		// Race condition: user quota was exhausted between check and consume
		// Note: Global budget was already consumed - no refunds per ADR 0026
		return apiError(
			c,
			429,
			'SUGGESTIONS_QUOTA_EXCEEDED',
			`You have used all ${userQuotaConsume.status.limit} lifetime suggestions for your account`,
			{
				quota: userQuotaConsume.status,
			}
		);
	}

	// 8. Generate suggestions (quota already consumed)
	return sseResponse(() => generateSuggestions(db, userId, batchId, llm, mode, limit, userBuckets), {
		onError: async (error) => {
			// Trip circuit breaker if provider returns quota/rate limit error
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
				await tripCircuitBreaker(db);
			}
			return sseEvent('error', { error: errorMessage });
		},
	});
});
