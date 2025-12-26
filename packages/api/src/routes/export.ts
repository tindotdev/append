import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, isNull, asc } from "drizzle-orm";
import { apiError } from "../lib/api-error";
import { schema, term, termSense, BUCKET, type Bucket } from "../db";

// =============================================================================
// Constants
// =============================================================================

/** Mapping from bucket slug to display title */
const BUCKET_TITLES: Record<Bucket, string> = {
	foundations: "Foundations",
	backend: "Backend",
	frontend: "Frontend",
	"dx-tooling": "DX Tooling",
	"deep-concepts": "Deep Concepts",
};

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
exportRoutes.get("/:bucket", async (c) => {
	const userId = c.get("userId");
	const bucketParam = c.req.param("bucket");
	const db = drizzle(c.env.DB, { schema });

	// -------------------------------------------------------------------------
	// 1. Validate bucket param
	// -------------------------------------------------------------------------
	if (!BUCKET.includes(bucketParam as Bucket)) {
		return apiError(c, 404, "NOT_FOUND", `Invalid bucket: ${bucketParam}`);
	}
	const bucket = bucketParam as Bucket;

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
		.where(
			and(
				eq(term.userId, userId),
				isNull(term.archivedAt),
				eq(termSense.bucket, bucket),
				isNull(termSense.archivedAt)
			)
		)
		.orderBy(asc(termSense.createdAt), asc(term.id));

	// -------------------------------------------------------------------------
	// 3. Generate markdown content
	// -------------------------------------------------------------------------
	const title = BUCKET_TITLES[bucket];
	const lines: string[] = [`# ${title}`, ""];

	for (const row of rows) {
		lines.push(`- ${row.displayTerm}: ${row.senseText}`);
	}

	// Add trailing newline
	const markdown = lines.join("\n") + "\n";

	// -------------------------------------------------------------------------
	// 4. Return response with correct headers
	// -------------------------------------------------------------------------
	return new Response(markdown, {
		status: 200,
		headers: {
			"content-type": "text/markdown; charset=utf-8",
			"content-disposition": `attachment; filename="${bucket}.md"`,
		},
	});
});

export { exportRoutes };
