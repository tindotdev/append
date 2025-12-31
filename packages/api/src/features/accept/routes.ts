/**
 * Accept routes: accept all candidates in a batch.
 */

import { vValidator } from '@hono/valibot-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, validationHook } from '../../shared/api-error';
import { acceptAll } from './usecases/acceptAll';
import { AcceptAllSchema } from './validation/acceptAll.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Accept routes - exported as the result of route chain for Hono RPC type inference.
 *
 * POST /api/batch/:id/accept - Accept all candidates and materialize to terms/senses
 */
export const acceptRoutes = app.post('/batch/:id/accept', vValidator('json', AcceptAllSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const batchId = c.req.param('id');
	const db = drizzle(c.env.DB, { schema });
	const body = c.req.valid('json');

	// Execute use case
	const result = await acceptAll(db, c.env.DB, userId, batchId, body);

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
