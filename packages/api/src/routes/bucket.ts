import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, isNull, lt, or, desc } from "drizzle-orm";
import { apiError } from "../lib/api-error";
import { schema, term, termSense, BUCKET, type Bucket } from "../db";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

// =============================================================================
// Types
// =============================================================================

type Bindings = {
	DB: D1Database;
};

type Variables = {
	userId: string;
};

interface CursorPayload {
	createdAt: number;
	termId: string;
}

interface BucketFeedItem {
	termId: string;
	displayTerm: string;
	canonical: string;
	primarySense: {
		id: string;
		bucket: Bucket;
		text: string;
		createdAt: number;
	};
}

interface BucketFeedResponse {
	bucket: string;
	items: BucketFeedItem[];
	nextCursor: string | null;
}

// =============================================================================
// Cursor encoding/decoding (base64url, no padding)
// =============================================================================

function encodeCursor(payload: CursorPayload): string {
	const json = JSON.stringify(payload);
	const bytes = new TextEncoder().encode(json);
	const base64 = btoa(String.fromCharCode(...bytes));
	// Convert to base64url (no padding)
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string): CursorPayload | null {
	try {
		// Convert from base64url to base64
		let base64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
		// Add padding if needed
		while (base64.length % 4 !== 0) {
			base64 += "=";
		}
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const json = new TextDecoder().decode(bytes);
		const parsed = JSON.parse(json);

		// Validate shape
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			typeof parsed.createdAt !== "number" ||
			typeof parsed.termId !== "string"
		) {
			return null;
		}

		return { createdAt: parsed.createdAt, termId: parsed.termId };
	} catch {
		return null;
	}
}

// =============================================================================
// Bucket routes
// =============================================================================

const bucketRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
bucketRoutes.get("/:slug", async (c) => {
	const userId = c.get("userId");
	const slug = c.req.param("slug");
	const db = drizzle(c.env.DB, { schema });

	// -------------------------------------------------------------------------
	// 1. Validate bucket slug
	// -------------------------------------------------------------------------
	if (!BUCKET.includes(slug as Bucket)) {
		return apiError(c, 404, "NOT_FOUND", `Invalid bucket: ${slug}`);
	}
	const bucket = slug as Bucket;

	// -------------------------------------------------------------------------
	// 2. Parse and validate query params
	// -------------------------------------------------------------------------
	const limitParam = c.req.query("limit");
	let limit = DEFAULT_LIMIT;
	if (limitParam !== undefined) {
		const parsed = parseInt(limitParam, 10);
		if (isNaN(parsed) || !Number.isInteger(parsed)) {
			return apiError(
				c,
				400,
				"VALIDATION_ERROR",
				"limit must be an integer"
			);
		}
		if (parsed < MIN_LIMIT || parsed > MAX_LIMIT) {
			return apiError(
				c,
				400,
				"VALIDATION_ERROR",
				`limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`
			);
		}
		limit = parsed;
	}

	const cursorParam = c.req.query("cursor");
	let cursor: CursorPayload | null = null;
	if (cursorParam !== undefined && cursorParam !== "") {
		cursor = decodeCursor(cursorParam);
		if (cursor === null) {
			return apiError(c, 400, "VALIDATION_ERROR", "Invalid cursor");
		}
	}

	// -------------------------------------------------------------------------
	// 3. Build and execute query using Drizzle's type-safe query builder
	// -------------------------------------------------------------------------
	// Query limit + 1 to detect if there's a next page
	const queryLimit = limit + 1;

	// Base conditions:
	// - term.user_id = userId
	// - term.primary_sense_id IS NOT NULL (enforced by innerJoin)
	// - term.archived_at IS NULL
	// - term_sense.bucket = bucket
	// - term_sense.archived_at IS NULL
	const baseConditions = and(
		eq(term.userId, userId),
		isNull(term.archivedAt),
		eq(termSense.bucket, bucket),
		isNull(termSense.archivedAt)
	);

	// Build the full WHERE clause with optional cursor pagination
	let whereClause;
	if (cursor) {
		// Cursor pagination for DESC ordering:
		// (created_at < cursorCreatedAt) OR (created_at = cursorCreatedAt AND term.id < cursorTermId)
		whereClause = and(
			baseConditions,
			or(
				lt(termSense.createdAt, new Date(cursor.createdAt)),
				and(
					eq(termSense.createdAt, new Date(cursor.createdAt)),
					lt(term.id, cursor.termId)
				)
			)
		);
	} else {
		whereClause = baseConditions;
	}

	// Execute query with innerJoin
	const rows = await db
		.select({
			termId: term.id,
			displayTerm: term.displayTerm,
			canonical: term.canonical,
			senseId: termSense.id,
			senseBucket: termSense.bucket,
			senseText: termSense.text,
			senseCreatedAt: termSense.createdAt,
		})
		.from(term)
		.innerJoin(termSense, eq(term.primarySenseId, termSense.id))
		.where(whereClause)
		.orderBy(desc(termSense.createdAt), desc(term.id))
		.limit(queryLimit);

	// -------------------------------------------------------------------------
	// 4. Determine if there's a next page and build response
	// -------------------------------------------------------------------------
	const hasNextPage = rows.length > limit;
	const itemRows = hasNextPage ? rows.slice(0, limit) : rows;

	const items: BucketFeedItem[] = itemRows.map((row) => ({
		termId: row.termId,
		displayTerm: row.displayTerm,
		canonical: row.canonical,
		primarySense: {
			id: row.senseId,
			bucket: row.senseBucket,
			text: row.senseText,
			createdAt: row.senseCreatedAt.getTime(),
		},
	}));

	let nextCursor: string | null = null;
	if (hasNextPage && itemRows.length > 0) {
		const lastItem = itemRows[itemRows.length - 1];
		nextCursor = encodeCursor({
			createdAt: lastItem.senseCreatedAt.getTime(),
			termId: lastItem.termId,
		});
	}

	const response: BucketFeedResponse = {
		bucket,
		items,
		nextCursor,
	};

	return c.json(response);
});

export { bucketRoutes };
