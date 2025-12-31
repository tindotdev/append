/**
 * Suggestions routes: generate suggestions for batch candidates.
 */

import { vValidator } from '@hono/valibot-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bucket } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { sseEvent, sseResponse } from '../../platform/sse';
import { apiError, validationHook } from '../../shared/api-error';
import { requireBatchOwned } from '../../shared/queries';
import { createLlmClient } from './adapters';
import { generateSuggestions } from './usecases/generateSuggestions';
import { SuggestSchema } from './validation/suggest.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

	// Create LLM client (async due to Secrets Store)
	const llm = await createLlmClient(c.env);
	if (!llm) {
		return apiError(c, 503, 'SERVICE_UNAVAILABLE', 'Suggestions are disabled');
	}

	// Verify batch exists and user owns it
	const batchOwnership = await requireBatchOwned(db, userId, batchId);
	if (!batchOwnership.ok) {
		const status = batchOwnership.error === 'not_found' ? 404 : 403;
		const code = batchOwnership.error === 'not_found' ? 'NOT_FOUND' : 'FORBIDDEN';
		const message = batchOwnership.error === 'not_found' ? 'Batch not found' : 'Access denied';
		return apiError(c, status, code, message);
	}

	// Fetch user's buckets for dynamic prompt (Phase 5C)
	const userBuckets = await db
		.select({ slug: bucket.slug, description: bucket.description })
		.from(bucket)
		.where(eq(bucket.userId, userId))
		.orderBy(bucket.order);

	if (userBuckets.length === 0) {
		return apiError(c, 400, 'VALIDATION_ERROR', 'No buckets configured. Please add at least one bucket.');
	}

	return sseResponse(() => generateSuggestions(db, userId, batchId, llm, mode, limit, userBuckets), {
		onError: (error) => {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return sseEvent('error', { error: errorMessage });
		},
	});
});
