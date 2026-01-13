/**
 * Batch routes: capture, list, and get batches.
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, apiErrorFrom, ownershipErrorMap, validationHook } from '../../shared/api-error';
import { captureTerms } from './usecases/captureTerms';
import { deleteBatch } from './usecases/deleteBatch';
import { getBatch } from './usecases/getBatch';
import { listBatches } from './usecases/listBatches';
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
	});
