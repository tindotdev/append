/**
 * Export routes.
 *
 * GET /api/export/:slug - Export all terms in a bucket as markdown
 * GET /api/export/history - Get export history
 */

import { Hono } from 'hono';
import { exportLog } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
import { requireUserBucketBySlug } from '../../shared/queries';
import { exportBucketWithCount } from './usecases/exportBucket';
import { getExportHistory } from './usecases/getExportHistory';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Export routes - exported as the result of route chain for Hono RPC type inference.
 *
 * GET /api/export/history - Get export history
 * GET /api/export/:slug - Export all terms in a bucket as markdown
 *
 * Note: /history must come before /:slug to avoid being captured by the param route
 */
export const exportRoutes = app
	.get('/history', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const limitParam = c.req.query('limit');
		const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10), 50) : 20;

		const result = await getExportHistory(db, userId, limit);

		return c.json(result);
	})
	.get('/:slug', async (c) => {
		const userId = c.get('userId');
		const slugParam = c.req.param('slug');
		const db = c.get('db');

		// Look up bucket by slug for this user
		const bucketResult = await requireUserBucketBySlug(db, userId, slugParam);
		if (!bucketResult.ok) {
			return apiError(c, 404, 'NOT_FOUND', `Bucket not found: ${slugParam}`);
		}
		const userBucket = bucketResult.value;

		// Export bucket as markdown and get entry count
		const { markdown, entryCount } = await exportBucketWithCount(db, userId, userBucket.slug, userBucket.name);

		// Log the export
		const filename = `${userBucket.slug}.md`;
		await db.insert(exportLog).values({
			id: crypto.randomUUID(),
			userId,
			bucketId: userBucket.id,
			bucketSlug: userBucket.slug,
			bucketName: userBucket.name,
			filename,
			entryCount,
		});

		// Return response with correct headers
		return new Response(markdown, {
			status: 200,
			headers: {
				'content-type': 'text/markdown; charset=utf-8',
				'content-disposition': `attachment; filename="${filename}"`,
			},
		});
	});
