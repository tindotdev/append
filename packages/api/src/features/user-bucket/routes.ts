/**
 * User bucket CRUD routes.
 *
 * GET    /api/user-bucket           List buckets (ordered, with sense counts)
 * POST   /api/user-bucket           Create bucket (limit 20)
 * PUT    /api/user-bucket/:id       Update name/description/color
 * DELETE /api/user-bucket/:id       Delete (fails if has senses)
 * PUT    /api/user-bucket/reorder   Bulk reorder
 */

import { vValidator } from '@hono/valibot-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, validationHook } from '../../shared/api-error';
import { createBucket } from './usecases/createBucket';
import { deleteBucket } from './usecases/deleteBucket';
import { listBuckets } from './usecases/listBuckets';
import { reorderBuckets } from './usecases/reorderBuckets';
import { updateBucket } from './usecases/updateBucket';
import { CreateBucketSchema, ReorderBucketsSchema, UpdateBucketSchema } from './validation/bucket.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * User bucket routes - chained for Hono RPC type inference.
 */
export const userBucketRoutes = app
	// GET /api/user-bucket - List all buckets for the authenticated user
	.get('/', async (c) => {
		const userId = c.get('userId');
		const db = drizzle(c.env.DB, { schema });

		const result = await listBuckets(db, userId);
		return c.json(result);
	})

	// POST /api/user-bucket - Create a new bucket
	.post('/', vValidator('json', CreateBucketSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = drizzle(c.env.DB, { schema });
		const body = c.req.valid('json');

		const result = await createBucket(db, userId, body);

		if (!result.success) {
			switch (result.error.type) {
				case 'limit_exceeded':
					return apiError(c, 400, 'VALIDATION_ERROR', result.error.message);
				case 'slug_exists':
					return apiError(c, 409, 'VERSION_CONFLICT', result.error.message);
			}
		}

		return c.json(result.result, 201);
	})

	// PUT /api/user-bucket/reorder - Bulk reorder buckets
	// NOTE: This route MUST come before /:id to avoid matching "reorder" as an ID
	.put('/reorder', vValidator('json', ReorderBucketsSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = drizzle(c.env.DB, { schema });
		const body = c.req.valid('json');

		const result = await reorderBuckets(db, userId, body);

		if (!result.success) {
			switch (result.error.type) {
				case 'invalid_ids':
					return apiError(c, 400, 'VALIDATION_ERROR', result.error.message);
				case 'incomplete':
					return apiError(c, 400, 'VALIDATION_ERROR', result.error.message);
			}
		}

		return c.json({ success: true });
	})

	// PUT /api/user-bucket/:id - Update a bucket
	.put('/:id', vValidator('json', UpdateBucketSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const bucketId = c.req.param('id');
		const db = drizzle(c.env.DB, { schema });
		const body = c.req.valid('json');

		const result = await updateBucket(db, userId, bucketId, body);

		if (!result.success) {
			switch (result.error.type) {
				case 'not_found':
					return apiError(c, 404, 'NOT_FOUND', result.error.message);
				case 'forbidden':
					return apiError(c, 403, 'FORBIDDEN', result.error.message);
			}
		}

		return c.json(result.result);
	})

	// DELETE /api/user-bucket/:id - Delete a bucket
	.delete('/:id', async (c) => {
		const userId = c.get('userId');
		const bucketId = c.req.param('id');
		const db = drizzle(c.env.DB, { schema });

		const result = await deleteBucket(db, userId, bucketId);

		if (!result.success) {
			switch (result.error.type) {
				case 'not_found':
					return apiError(c, 404, 'NOT_FOUND', result.error.message);
				case 'forbidden':
					return apiError(c, 403, 'FORBIDDEN', result.error.message);
				case 'has_senses':
					return apiError(c, 409, 'VERSION_CONFLICT', result.error.message, {
						senseCount: result.error.senseCount,
					});
			}
		}

		return c.json({ success: true });
	});
