/**
 * Batch routes: capture, list, and get batches.
 */

import { vValidator } from '@hono/valibot-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, validationHook } from '../../shared/api-error';
import { captureTerms } from './usecases/captureTerms';
import { getBatch } from './usecases/getBatch';
import { listBatches } from './usecases/listBatches';
import { CaptureTermsSchema, MAX_BODY_SIZE } from './validation/captureTerms.schema';
import { ListBatchesSchema } from './validation/listBatches.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Batch routes - chained for Hono RPC type inference.
 *
 * POST /api/batch - Create a new batch of candidates (idempotent)
 * GET /api/batch - List batches for the authenticated user
 * GET /api/batch/:id - Get a batch by ID (owner-only)
 */
export const batchRoutes = app
	.post(
		'/',
		bodyLimit({ maxSize: MAX_BODY_SIZE, onError: (c) => apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large') }),
		vValidator('json', CaptureTermsSchema, validationHook),
		async (c) => {
			const userId = c.get('userId');
			const db = drizzle(c.env.DB, { schema });
			const body = c.req.valid('json');

			// Execute use case
			const result = await captureTerms(db, c.env.DB, userId, body);

			if (!result.success) {
				switch (result.error.type) {
					case 'idempotency_conflict':
						return apiError(c, 409, 'IDEMPOTENCY_CONFLICT', result.error.message);
					case 'internal_error':
						return apiError(c, 500, 'INTERNAL_ERROR', result.error.message);
				}
			}

			// Return 200 for replay, 201 for new batch
			const status = result.result.isReplay ? 200 : 201;
			return c.json({ id: result.result.id, candidateCount: result.result.candidateCount }, status);
		}
	)
	.get('/', vValidator('query', ListBatchesSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = drizzle(c.env.DB, { schema });
		const query = c.req.valid('query');

		// Execute use case
		const result = await listBatches(db, userId, query);

		return c.json(result);
	})
	.get('/:id', async (c) => {
		const userId = c.get('userId');
		const batchId = c.req.param('id');
		const db = drizzle(c.env.DB, { schema });

		// Execute use case
		const result = await getBatch(db, userId, batchId);

		if (!result.success) {
			switch (result.error.type) {
				case 'not_found':
					return apiError(c, 404, 'NOT_FOUND', 'Batch not found');
				case 'forbidden':
					return apiError(c, 403, 'FORBIDDEN', 'Access denied');
			}
		}

		return c.json(result.result);
	});
