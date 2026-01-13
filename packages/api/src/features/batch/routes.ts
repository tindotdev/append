/**
 * Batch routes: capture, list, and get batches.
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, apiErrorFrom, ownershipErrorMap, validationHook } from '../../shared/api-error';
import { acceptAll } from './usecases/acceptAll';
import { bulkAccept } from './usecases/bulkAccept';
import { bulkDeleteBatches } from './usecases/bulkDelete';
import { captureTerms } from './usecases/captureTerms';
import { deleteBatch } from './usecases/deleteBatch';
import { getBatch } from './usecases/getBatch';
import { listBatches } from './usecases/listBatches';
import { AcceptAllSchema } from './validation/acceptAll.schema';
import { BulkBatchIdsSchema } from './validation/bulkBatch.schema';
import { CaptureTermsSchema, MAX_BODY_SIZE } from './validation/captureTerms.schema';
import { ListBatchesSchema } from './validation/listBatches.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const batchAccessErrors = ownershipErrorMap('Batch');

/**
 * Batch routes - chained for Hono RPC type inference.
 *
 * POST /api/batch - Create a new batch of candidates (idempotent)
 * GET /api/batch - List batches for the authenticated user
 * GET /api/batch/:id - Get a batch by ID (owner-only)
 * DELETE /api/batch/:id - Delete a batch and all its candidates (owner-only)
 * POST /api/batch/:id/accept - Accept all candidates and materialize to terms/senses
 * POST /api/batch/bulk/accept - Bulk accept multiple batches
 * POST /api/batch/bulk/delete - Bulk delete multiple batches
 */
export const batchRoutes = app
	.post(
		'/',
		bodyLimit({ maxSize: MAX_BODY_SIZE, onError: (c) => apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large') }),
		vValidator('json', CaptureTermsSchema, validationHook),
		async (c) => {
			const userId = c.get('userId');
			const db = c.get('db');
			const body = c.req.valid('json');

			// Execute use case
			const result = await captureTerms(db, c.env.DB, userId, body);

			if (!result.success) {
				return apiErrorFrom(c, result.error, {
					idempotency_conflict: { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: (error) => error.message },
					internal_error: { status: 500, code: 'INTERNAL_ERROR', message: (error) => error.message },
				});
			}

			// Return 200 for replay, 201 for new batch
			const status = result.result.isReplay ? 200 : 201;
			return c.json({ id: result.result.id, candidateCount: result.result.candidateCount }, status);
		}
	)
	.get('/', vValidator('query', ListBatchesSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const query = c.req.valid('query');

		// Execute use case
		const result = await listBatches(db, userId, query);

		return c.json(result);
	})
	.get('/:id', async (c) => {
		const userId = c.get('userId');
		const batchId = c.req.param('id');
		const db = c.get('db');

		// Execute use case
		const result = await getBatch(db, userId, batchId);

		if (!result.success) {
			return apiErrorFrom(c, result.error, batchAccessErrors);
		}

		return c.json(result.result);
	})
	.delete('/:id', async (c) => {
		const userId = c.get('userId');
		const batchId = c.req.param('id');
		const db = c.get('db');

		// Execute use case
		const result = await deleteBatch(db, userId, batchId);

		if (!result.success) {
			return apiErrorFrom(c, result.error, batchAccessErrors);
		}

		// Return 204 No Content on successful delete
		return c.body(null, 204);
	})
	.post('/bulk/accept', vValidator('json', BulkBatchIdsSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const body = c.req.valid('json');

		// Execute use case
		const result = await bulkAccept(db, c.env.DB, userId, body);

		return c.json(result, 200);
	})
	.post('/bulk/delete', vValidator('json', BulkBatchIdsSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const body = c.req.valid('json');

		// Execute use case
		const result = await bulkDeleteBatches(db, userId, body);

		return c.json(result, 200);
	})
	.post('/:id/accept', vValidator('json', AcceptAllSchema, validationHook), async (c) => {
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
