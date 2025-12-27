/**
 * Batch routes: capture, list, and get batches.
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as v from 'valibot';
import type { Bindings, Variables } from '../../platform/env';
import { schema } from '../../db';
import { apiError } from '../../shared/api-error';
import { CaptureTermsSchema, MAX_BODY_SIZE } from './validation/captureTerms.schema';
import { ListBatchesSchema, DEFAULT_LIMIT } from './validation/listBatches.schema';
import { captureTerms } from './usecases/captureTerms';
import { listBatches } from './usecases/listBatches';
import { getBatch } from './usecases/getBatch';

export const batchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /api/batch - Create a new batch of candidates (idempotent)
 */
batchRoutes.post('/', async (c) => {
	const userId = c.get('userId');
	const db = drizzle(c.env.DB, { schema });

	// Enforce body size limit
	const contentLength = c.req.header('content-length');
	if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
		return apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
	}

	const rawBody = await c.req.text();
	if (rawBody.length > MAX_BODY_SIZE) {
		return apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
	}

	// Parse JSON
	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return apiError(c, 400, 'INVALID_JSON', 'Invalid JSON in request body');
	}

	// Validate with valibot
	const parseResult = v.safeParse(CaptureTermsSchema, body);
	if (!parseResult.success) {
		const issue = parseResult.issues[0];
		return apiError(c, 400, 'VALIDATION_ERROR', issue.message);
	}

	// Execute use case
	const result = await captureTerms(db, c.env.DB, userId, parseResult.output);

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
});

/**
 * GET /api/batch - List batches for the authenticated user
 */
batchRoutes.get('/', async (c) => {
	const userId = c.get('userId');
	const db = drizzle(c.env.DB, { schema });

	// Parse query parameters
	const queryParams = {
		limit: c.req.query('limit'),
		cursor: c.req.query('cursor'),
	};

	// Validate with valibot
	const parseResult = v.safeParse(ListBatchesSchema, queryParams);
	if (!parseResult.success) {
		const issue = parseResult.issues[0];
		return apiError(c, 400, 'VALIDATION_ERROR', issue.message);
	}

	// Execute use case
	const result = await listBatches(db, userId, parseResult.output);

	return c.json(result);
});

/**
 * GET /api/batch/:id - Get a batch by ID (owner-only)
 */
batchRoutes.get('/:id', async (c) => {
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
