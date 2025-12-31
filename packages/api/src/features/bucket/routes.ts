/**
 * Bucket feed routes.
 *
 * GET /api/bucket/:slug - Get paginated feed of terms in a bucket
 */

import { vValidator } from '@hono/valibot-validator';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { bucket, schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, validationHook } from '../../shared/api-error';
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
	const db = drizzle(c.env.DB, { schema });
	const query = c.req.valid('query');

	// Look up bucket by slug for this user
	const [userBucket] = await db
		.select({ slug: bucket.slug })
		.from(bucket)
		.where(and(eq(bucket.userId, userId), eq(bucket.slug, slugParam)))
		.limit(1);

	if (!userBucket) {
		return apiError(c, 404, 'NOT_FOUND', `Bucket not found: ${slugParam}`);
	}

	// Call usecase
	const result = await getBucketFeed(db, userId, userBucket.slug, query);
	if (!result.success) {
		// Only error type is 'invalid_cursor'
		return apiError(c, 400, 'VALIDATION_ERROR', 'Invalid cursor');
	}

	return c.json(result.result);
});
