/**
 * Export routes.
 *
 * GET /api/export/:slug - Export all terms in a bucket as markdown
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
import { requireUserBucketBySlug } from '../../shared/queries';
import { exportBucket } from './usecases/exportBucket';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Export routes - exported as the result of route chain for Hono RPC type inference.
 *
 * GET /api/export/:slug - Export all terms in a bucket as markdown
 *
 * Response: text/markdown file with content-disposition attachment
 */
export const exportRoutes = app.get('/:slug', async (c) => {
	const userId = c.get('userId');
	const slugParam = c.req.param('slug');
	const db = c.get('db');

	// Look up bucket by slug for this user
	const bucketResult = await requireUserBucketBySlug(db, userId, slugParam);
	if (!bucketResult.ok) {
		return apiError(c, 404, 'NOT_FOUND', `Bucket not found: ${slugParam}`);
	}
	const userBucket = bucketResult.value;

	// Export bucket as markdown
	const markdown = await exportBucket(db, userId, userBucket.slug, userBucket.name);

	// Return response with correct headers
	return new Response(markdown, {
		status: 200,
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="${userBucket.slug}.md"`,
		},
	});
});
