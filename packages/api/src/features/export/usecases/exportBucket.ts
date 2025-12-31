/**
 * Use case: Export bucket as markdown.
 *
 * Returns all terms in a specific bucket with their primary sense
 * formatted as a markdown document.
 */

import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, term, termSense } from '../../../db';

/**
 * Export all terms in a bucket as markdown.
 *
 * Format:
 * # {Bucket Name}
 *
 * - {displayTerm}: {primarySenseText}
 * - {displayTerm}: {primarySenseText}
 * ...
 *
 * Ordering: term_sense.created_at ASC, term.id ASC (deterministic)
 *
 * Filtering:
 * - term.user_id = userId
 * - term.archived_at IS NULL
 * - term.primary_sense_id IS NOT NULL (enforced by join)
 * - term_sense.archived_at IS NULL
 * - term_sense.bucket = bucketSlug
 */
export async function exportBucket(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	bucketSlug: string,
	bucketName: string
): Promise<string> {
	const rows = await db
		.select({
			termId: term.id,
			displayTerm: term.displayTerm,
			senseText: termSense.text,
			senseCreatedAt: termSense.createdAt,
		})
		.from(term)
		.innerJoin(termSense, eq(term.primarySenseId, termSense.id))
		.where(and(eq(term.userId, userId), isNull(term.archivedAt), eq(termSense.bucket, bucketSlug), isNull(termSense.archivedAt)))
		.orderBy(asc(termSense.createdAt), asc(term.id));

	const lines: string[] = [`# ${bucketName}`, ''];

	for (const row of rows) {
		lines.push(`- ${row.displayTerm}: ${row.senseText}`);
	}

	// Add trailing newline
	return `${lines.join('\n')}\n`;
}
