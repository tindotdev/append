/**
 * Export routes.
 *
 * GET /api/export/:bucket - Export all terms in a bucket as markdown
 */

import { safeParseBucket } from '@append/contracts/validators';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
import { exportBucket } from './usecases/exportBucket';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Export routes - exported as the result of route chain for Hono RPC type inference.
 *
 * GET /api/export/:bucket - Export all terms in a bucket as markdown
 *
 * Response: text/markdown file with content-disposition attachment
 */
export const exportRoutes = app.get('/:bucket', async (c) => {
	const userId = c.get('userId');
	const bucketParam = c.req.param('bucket');
	const db = drizzle(c.env.DB, { schema });

	// Validate bucket param (will be replaced with user's bucket lookup in Phase 5)
	const parsedBucket = safeParseBucket(bucketParam);
	if (!parsedBucket.success) {
		return apiError(c, 404, 'NOT_FOUND', `Invalid bucket: ${bucketParam}`);
	}

	// Export bucket as markdown
	const markdown = await exportBucket(db, userId, parsedBucket.output);

	// Return response with correct headers
	return new Response(markdown, {
		status: 200,
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="${parsedBucket.output}.md"`,
		},
	});
});
