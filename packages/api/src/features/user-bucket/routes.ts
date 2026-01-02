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
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, validationHook } from '../../shared/api-error';
import { createBucket } from './usecases/createBucket';
import { deleteBucket } from './usecases/deleteBucket';
import { listBuckets } from './usecases/listBuckets';
import { reorderBuckets } from './usecases/reorderBuckets';
import { updateBucket } from './usecases/updateBucket';
import { CreateBucketSchema, ReorderBucketsSchema, UpdateBucketSchema } from './validation/bucket.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const bucketAccessErrors = {
	not_found: { status: 404, code: 'NOT_FOUND', message: (error: { message: string }) => error.message },
	forbidden: { status: 403, code: 'FORBIDDEN', message: (error: { message: string }) => error.message },
} as const;

/**
 * User bucket routes - chained for Hono RPC type inference.
 */
export const userBucketRoutes = app
	// GET /api/user-bucket - List all buckets for the authenticated user
	.get('/', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const result = await listBuckets(db, userId);
		return c.json(result);
	})

	// POST /api/user-bucket - Create a new bucket
	.post('/', vValidator('json', CreateBucketSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const body = c.req.valid('json');

		const result = await createBucket(db, userId, body);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				limit_exceeded: { status: 400, code: 'VALIDATION_ERROR', message: (error) => error.message },
				slug_exists: { status: 409, code: 'VERSION_CONFLICT', message: (error) => error.message },
			});
		}

		return c.json(result.result, 201);
	})

	// PUT /api/user-bucket/reorder - Bulk reorder buckets
	// NOTE: This route MUST come before /:id to avoid matching "reorder" as an ID
	.put('/reorder', vValidator('json', ReorderBucketsSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const body = c.req.valid('json');

		const result = await reorderBuckets(db, userId, body);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				invalid_ids: { status: 400, code: 'VALIDATION_ERROR', message: (error) => error.message },
				incomplete: { status: 400, code: 'VALIDATION_ERROR', message: (error) => error.message },
			});
		}

		return c.json({ success: true });
	})

	// PUT /api/user-bucket/:id - Update a bucket
	.put('/:id', vValidator('json', UpdateBucketSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const bucketId = c.req.param('id');
		const db = c.get('db');
		const body = c.req.valid('json');

		const result = await updateBucket(db, userId, bucketId, body);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				...bucketAccessErrors,
			});
		}

		return c.json(result.result);
	})

	// DELETE /api/user-bucket/:id - Delete a bucket
	.delete('/:id', async (c) => {
		const userId = c.get('userId');
		const bucketId = c.req.param('id');
		const db = c.get('db');

		const result = await deleteBucket(db, userId, bucketId);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				...bucketAccessErrors,
				has_senses: {
					status: 409,
					code: 'VERSION_CONFLICT',
					message: (error) => error.message,
					details: (error) => ({ senseCount: error.senseCount }),
				},
			});
		}

		return c.json({ success: true });
	});
