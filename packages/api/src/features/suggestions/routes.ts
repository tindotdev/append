/**
 * Suggestions routes: generate suggestions for batch candidates.
 */

import { vValidator } from '@hono/valibot-validator';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { batch, schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { sseHeaders } from '../../platform/sse';
import { apiError, validationHook } from '../../shared/api-error';
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
	const db = drizzle(c.env.DB, { schema });
	const query = c.req.valid('query');

	const { limit, regenerate } = query;
	const mode = regenerate ? 'regenerate' : 'fill-missing';

	// Create LLM client (async due to Secrets Store)
	const llm = await createLlmClient(c.env);
	if (!llm) {
		return apiError(c, 503, 'SERVICE_UNAVAILABLE', 'Suggestions are disabled');
	}

	// Verify batch exists and user owns it
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
	});

	if (!batchRow) {
		return apiError(c, 404, 'NOT_FOUND', 'Batch not found');
	}

	if (batchRow.userId !== userId) {
		return apiError(c, 403, 'FORBIDDEN', 'Access denied');
	}

	// Create SSE stream
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				const generator = generateSuggestions(db, userId, batchId, llm, mode, limit);

				for await (const chunk of generator) {
					controller.enqueue(encoder.encode(chunk));
				}
			} catch (error) {
				// Emit error event if something goes wrong
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				const errorEvent = `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`;
				controller.enqueue(encoder.encode(errorEvent));
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, { headers: sseHeaders() });
});
