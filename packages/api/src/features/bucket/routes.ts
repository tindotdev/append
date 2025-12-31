/**
 * Bucket feed routes.
 *
 * GET /api/bucket/:slug - Get paginated feed of terms in a bucket
 */

import { vValidator } from '@hono/valibot-validator';
import { safeParseBucket } from '@append/contracts/validators';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { schema } from '../../db';
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
	const slug = c.req.param('slug');
	const db = drizzle(c.env.DB, { schema });
	const query = c.req.valid('query');

	// Validate bucket slug (will be replaced with user's bucket lookup in Phase 5)
	const parsedBucket = safeParseBucket(slug);
	if (!parsedBucket.success) {
		return apiError(c, 404, 'NOT_FOUND', `Invalid bucket: ${slug}`);
	}

	// Call usecase
	const result = await getBucketFeed(db, userId, parsedBucket.output, query);
	if (!result.success) {
		// Only error type is 'invalid_cursor'
		return apiError(c, 400, 'VALIDATION_ERROR', 'Invalid cursor');
	}

	return c.json(result.result);
});
