/**
 * Accept routes: accept all candidates in a batch.
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as v from 'valibot';
import type { Bindings, Variables } from '../../platform/env';
import { schema } from '../../db';
import { apiError } from '../../shared/api-error';
import { AcceptAllSchema } from './validation/acceptAll.schema';
import { acceptAll } from './usecases/acceptAll';

export const acceptRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /api/batch/:id/accept - Accept all candidates and materialize to terms/senses
 */
acceptRoutes.post('/batch/:id/accept', async (c) => {
	const userId = c.get('userId');
	const batchId = c.req.param('id');
	const db = drizzle(c.env.DB, { schema });

	// Parse request body
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return apiError(c, 400, 'INVALID_JSON', 'Invalid JSON in request body');
	}

	// Validate with valibot
	const parseResult = v.safeParse(AcceptAllSchema, body);
	if (!parseResult.success) {
		const issue = parseResult.issues[0];
		return apiError(c, 400, 'VALIDATION_ERROR', issue.message);
	}

	// Execute use case
	const result = await acceptAll(db, c.env.DB, userId, batchId, parseResult.output);

	if (!result.success) {
		switch (result.error.type) {
			case 'not_found':
				return apiError(c, 404, 'NOT_FOUND', 'Batch not found');
			case 'forbidden':
				return apiError(c, 403, 'FORBIDDEN', 'Access denied');
			case 'suggestions_in_progress':
				return apiError(c, 409, 'BATCH_NOT_READY', 'Some candidates have suggestions in progress', {
					reason: 'SUGGESTIONS_IN_PROGRESS',
					inProgressCandidateIds: result.error.candidateIds,
				});
			case 'missing_effective_fields':
				return apiError(c, 409, 'BATCH_NOT_READY', 'Some candidates are missing effective bucket or text', {
					reason: 'MISSING_EFFECTIVE_FIELDS',
					missingCandidateIds: result.error.candidateIds,
				});
			case 'idempotency_conflict':
				return apiError(c, 409, 'IDEMPOTENCY_CONFLICT', 'clientRequestId was used for a different batch', {
					originalBatchId: result.error.originalBatchId,
				});
			case 'internal_error':
				return apiError(c, 500, 'INTERNAL_ERROR', result.error.message);
		}
	}

	return c.json(result.result, 200);
});
