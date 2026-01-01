/**
 * Bucket feed routes.
 *
 * GET /api/bucket/:slug - Get paginated feed of terms in a bucket
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, apiErrorFrom, validationHook } from '../../shared/api-error';
import { requireUserBucketBySlug } from '../../shared/queries';
import { getBucketFeed } from './usecases/getBucketFeed';
import { GetBucketFeedParamsSchema } from './validation/getBucketFeed.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/bucket/:slug - Get paginated feed of terms in a bucket
 *
 * Query params:
 *   - limit (optional): integer 1-200, default 50
 *   - cursor (optional): base64url-encoded cursor for pagination
 *
 * Response 200: { bucket, items, nextCursor }
 * Errors: 400, 401, 404
 */
/**
 * Bucket routes - exported as the result of route chain for Hono RPC type inference.
 */
export const bucketRoutes = app.get('/:slug', vValidator('query', GetBucketFeedParamsSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const slugParam = c.req.param('slug');
	const db = c.get('db');
	const query = c.req.valid('query');

	// Look up bucket by slug for this user
	const bucketResult = await requireUserBucketBySlug(db, userId, slugParam);
	if (!bucketResult.ok) {
		return apiError(c, 404, 'NOT_FOUND', `Bucket not found: ${slugParam}`);
	}
	const userBucket = bucketResult.value;

	// Call usecase
	const result = await getBucketFeed(db, userId, userBucket.slug, query);
	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			invalid_cursor: { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid cursor' },
		});
	}

	return c.json(result.result);
});
