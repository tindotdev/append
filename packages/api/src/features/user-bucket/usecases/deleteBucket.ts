/**
 * Delete a bucket.
 * Fails if the bucket contains any active term senses (ON DELETE RESTRICT).
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket, term, termSense, type schema } from '../../../db';

export type DeleteBucketError =
	| { type: 'not_found'; message: string }
	| { type: 'forbidden'; message: string }
	| { type: 'has_senses'; message: string; senseCount: number };

export type DeleteBucketResult = { success: true } | { success: false; error: DeleteBucketError };

export async function deleteBucket(db: DrizzleD1Database<typeof schema>, userId: string, bucketId: string): Promise<DeleteBucketResult> {
	// Fetch bucket to verify ownership
	const [existing] = await db.select({ id: bucket.id, userId: bucket.userId }).from(bucket).where(eq(bucket.id, bucketId)).limit(1);

	if (!existing) {
		return {
			success: false,
			error: { type: 'not_found', message: 'Bucket not found' },
		};
	}

	if (existing.userId !== userId) {
		return {
			success: false,
			error: { type: 'forbidden', message: 'Access denied' },
		};
	}

	// Check for active term senses in this bucket
	const [senseResult] = await db
		.select({
			count: sql<number>`COUNT(*)`,
		})
		.from(termSense)
		.innerJoin(term, eq(termSense.termId, term.id))
		.where(and(eq(termSense.bucketId, bucketId), eq(term.userId, userId), isNull(termSense.archivedAt), isNull(term.archivedAt)));

	const senseCount = Number(senseResult?.count ?? 0);

	if (senseCount > 0) {
		return {
			success: false,
			error: {
				type: 'has_senses',
				message: `Cannot delete bucket with ${senseCount} active term senses`,
				senseCount,
			},
		};
	}

	// Delete the bucket
	await db.delete(bucket).where(and(eq(bucket.id, bucketId), eq(bucket.userId, userId)));

	return { success: true };
}
