/**
 * Accept routes: accept all candidates in a batch.
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, validationHook } from '../../shared/api-error';
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
	const db = c.get('db');
	const body = c.req.valid('json');

	// Execute use case
	const result = await acceptAll(db, c.env.DB, userId, batchId, body);

	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			not_found: { status: 404, code: 'NOT_FOUND', message: 'Batch not found' },
			forbidden: { status: 403, code: 'FORBIDDEN', message: 'Access denied' },
			suggestions_in_progress: {
				status: 409,
				code: 'BATCH_NOT_READY',
				message: 'Some candidates have suggestions in progress',
				details: (error) => ({
					reason: 'SUGGESTIONS_IN_PROGRESS',
					inProgressCandidateIds: error.candidateIds,
				}),
			},
			missing_effective_fields: {
				status: 409,
				code: 'BATCH_NOT_READY',
				message: 'Some candidates are missing effective bucket or text',
				details: (error) => ({
					reason: 'MISSING_EFFECTIVE_FIELDS',
					missingCandidateIds: error.candidateIds,
				}),
			},
			idempotency_conflict: {
				status: 409,
				code: 'IDEMPOTENCY_CONFLICT',
				message: 'clientRequestId was used for a different batch',
				details: (error) => ({ originalBatchId: error.originalBatchId }),
			},
			internal_error: { status: 500, code: 'INTERNAL_ERROR', message: (error) => error.message },
		});
	}

	return c.json(result.result, 200);
});
