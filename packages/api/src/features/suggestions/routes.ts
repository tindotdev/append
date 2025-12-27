/**
 * Suggestions routes: generate suggestions for batch candidates.
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import type { Bindings, Variables } from '../../platform/env';
import { sseHeaders } from '../../platform/sse';
import { schema, batch } from '../../db';
import { apiError } from '../../shared/api-error';
import { createLlmClient } from './adapters';
import { SuggestSchema, DEFAULT_LIMIT } from './validation/suggest.schema';
import { generateSuggestions } from './usecases/generateSuggestions';

export const suggestionsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /api/batch/:id/suggest - Generate suggestions with SSE streaming
 */
suggestionsRoutes.post('/batch/:id/suggest', async (c) => {
	const userId = c.get('userId');
	const batchId = c.req.param('id');
	const db = drizzle(c.env.DB, { schema });

	// Parse query parameters
	const queryParams = {
		limit: c.req.query('limit'),
		regenerate: c.req.query('regenerate'),
	};

	// Validate with valibot
	const parseResult = v.safeParse(SuggestSchema, queryParams);
	if (!parseResult.success) {
		const issue = parseResult.issues[0];
		return apiError(c, 400, 'VALIDATION_ERROR', issue.message);
	}

	const { limit, regenerate } = parseResult.output;
	const mode = regenerate ? 'regenerate' : 'fill-missing';

	// Create LLM client
	const llm = createLlmClient(c.env);
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
