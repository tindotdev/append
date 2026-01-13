/**
 * Use case: Get paginated bucket feed.
 *
 * Returns terms in a specific bucket with their primary sense,
 * ordered by sense creation date (DESC) with cursor pagination.
 */

import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term, termSense } from '../../../db';
import { type BucketFeedCursor, decodeCursor, encodeCursor, type GetBucketFeedParams } from '../validation/getBucketFeed.schema';

/**
 * A single item in the bucket feed.
 */
export interface BucketFeedItem {
	termId: string;
	displayTerm: string;
	canonical: string;
	termVersion: number;
	primarySense: {
		id: string;
		bucket: string;
		text: string;
		createdAt: number;
		version: number;
	};
}

/**
 * Response from getBucketFeed.
 */
export interface BucketFeedResponse {
	bucket: string;
	items: BucketFeedItem[];
	nextCursor: string | null;
}

/**
 * Possible errors from getBucketFeed.
 */
export type GetBucketFeedError = { type: 'invalid_cursor' };

/**
 * Get paginated bucket feed for a user.
 */
export async function getBucketFeed(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	bucket: string,
	params: GetBucketFeedParams
): Promise<{ success: true; result: BucketFeedResponse } | { success: false; error: GetBucketFeedError }> {
	// Parse cursor if provided
	let cursor: BucketFeedCursor | null = null;
	if (params.cursor !== undefined && params.cursor !== '') {
		cursor = decodeCursor(params.cursor);
		if (cursor === null) {
			return { success: false, error: { type: 'invalid_cursor' } };
		}
	}

	// Query limit + 1 to detect if there's a next page
	const queryLimit = params.limit + 1;

	// Base conditions:
	// - term.user_id = userId
	// - term.primary_sense_id IS NOT NULL (enforced by innerJoin)
	// - term.archived_at IS NULL
	// - term_sense.bucket = bucket
	// - term_sense.archived_at IS NULL
	const baseConditions = and(eq(term.userId, userId), isNull(term.archivedAt), eq(termSense.bucket, bucket), isNull(termSense.archivedAt));

	// Build the full WHERE clause with optional cursor pagination
	let whereClause: typeof baseConditions;
	if (cursor) {
		// Cursor pagination for DESC ordering:
		// (created_at < cursorCreatedAt) OR (created_at = cursorCreatedAt AND term.id < cursorTermId)
		whereClause = and(
			baseConditions,
			or(
				lt(termSense.createdAt, new Date(cursor.createdAt)),
				and(eq(termSense.createdAt, new Date(cursor.createdAt)), lt(term.id, cursor.termId))
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
			termVersion: term.version,
			senseId: termSense.id,
			senseBucket: termSense.bucket,
			senseText: termSense.text,
			senseCreatedAt: termSense.createdAt,
			senseVersion: termSense.version,
		})
		.from(term)
		.innerJoin(termSense, eq(term.primarySenseId, termSense.id))
		.where(whereClause)
		.orderBy(desc(termSense.createdAt), desc(term.id))
		.limit(queryLimit);

	// Determine if there's a next page and build response
	const hasNextPage = rows.length > params.limit;
	const itemRows = hasNextPage ? rows.slice(0, params.limit) : rows;

	const items: BucketFeedItem[] = itemRows.map((row) => ({
		termId: row.termId,
		displayTerm: row.displayTerm,
		canonical: row.canonical,
		termVersion: row.termVersion,
		primarySense: {
			id: row.senseId,
			bucket: row.senseBucket,
			text: row.senseText,
			createdAt: row.senseCreatedAt.getTime(),
			version: row.senseVersion,
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

	return {
		success: true,
		result: {
			bucket,
			items,
			nextCursor,
		},
	};
}
