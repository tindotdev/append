/**
 * Bucket feed routes.
 *
 * GET /api/bucket/:slug - Get paginated feed of terms in a bucket
 */

import { safeParseBucket } from '@append/contracts/validators';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as v from 'valibot';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
import { getBucketFeed } from './usecases/getBucketFeed';
import { GetBucketFeedParamsSchema } from './validation/getBucketFeed.schema';

export const bucketRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
bucketRoutes.get('/:slug', async (c) => {
	const userId = c.get('userId');
	const slug = c.req.param('slug');
	const db = drizzle(c.env.DB, { schema });

	// Validate bucket slug
	const parsedBucket = safeParseBucket(slug);
	if (!parsedBucket.success) {
		return apiError(c, 404, 'NOT_FOUND', `Invalid bucket: ${slug}`);
	}

	// Validate query params
	const parseResult = v.safeParse(GetBucketFeedParamsSchema, {
		limit: c.req.query('limit'),
		cursor: c.req.query('cursor'),
	});
	if (!parseResult.success) {
		const issue = parseResult.issues[0];
		return apiError(c, 400, 'VALIDATION_ERROR', issue.message);
	}

	// Call usecase
	const result = await getBucketFeed(db, userId, parsedBucket.output, parseResult.output);
	if (!result.success) {
		// Only error type is 'invalid_cursor'
		return apiError(c, 400, 'VALIDATION_ERROR', 'Invalid cursor');
	}

	return c.json(result.result);
});
