import { BUCKET_TITLES, type Bucket } from '@append/contracts/types';
import { safeParseBucket } from '@append/contracts/validators';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { schema, term, termSense } from '../db';
import { apiError } from '../lib/api-error';

// =============================================================================
// Types
// =============================================================================

type Bindings = {
	DB: D1Database;
};

type Variables = {
	userId: string;
};

// =============================================================================
// Export routes
// =============================================================================

const exportRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/export/:bucket - Export all terms in a bucket as markdown
 *
 * Response: text/markdown file with content-disposition attachment
 *
 * Format:
 * # {Bucket Title}
 *
 * - {displayTerm}: {primarySenseText}
 * - {displayTerm}: {primarySenseText}
 * ...
 *
 * Ordering: term_sense.created_at ASC, term.id ASC (deterministic)
 *
 * Filtering:
 * - term.user_id = session.user.id
 * - term.archived_at IS NULL
 * - term.primary_sense_id IS NOT NULL (enforced by join)
 * - term_sense.archived_at IS NULL
 * - term_sense.bucket = :bucket
 */
exportRoutes.get('/:bucket', async (c) => {
	const userId = c.get('userId');
	const bucketParam = c.req.param('bucket');
	const db = drizzle(c.env.DB, { schema });

	// -------------------------------------------------------------------------
	// 1. Validate bucket param
	// -------------------------------------------------------------------------
	const parsedBucket = safeParseBucket(bucketParam);
	if (!parsedBucket.success) {
		return apiError(c, 404, 'NOT_FOUND', `Invalid bucket: ${bucketParam}`);
	}
	const bucket: Bucket = parsedBucket.output;

	// -------------------------------------------------------------------------
	// 2. Query terms with primary senses in this bucket
	// -------------------------------------------------------------------------
	const rows = await db
		.select({
			termId: term.id,
			displayTerm: term.displayTerm,
			senseText: termSense.text,
			senseCreatedAt: termSense.createdAt,
		})
		.from(term)
		.innerJoin(termSense, eq(term.primarySenseId, termSense.id))
		.where(and(eq(term.userId, userId), isNull(term.archivedAt), eq(termSense.bucket, bucket), isNull(termSense.archivedAt)))
		.orderBy(asc(termSense.createdAt), asc(term.id));

	// -------------------------------------------------------------------------
	// 3. Generate markdown content
	// -------------------------------------------------------------------------
	const title = BUCKET_TITLES[bucket];
	const lines: string[] = [`# ${title}`, ''];

	for (const row of rows) {
		lines.push(`- ${row.displayTerm}: ${row.senseText}`);
	}

	// Add trailing newline
	const markdown = lines.join('\n') + '\n';

	// -------------------------------------------------------------------------
	// 4. Return response with correct headers
	// -------------------------------------------------------------------------
	return new Response(markdown, {
		status: 200,
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="${bucket}.md"`,
		},
	});
});

export { exportRoutes };
