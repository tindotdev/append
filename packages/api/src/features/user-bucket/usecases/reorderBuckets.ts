/**
 * Reorder buckets by setting new order values based on the provided ID array.
 */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket, type schema } from '../../../db';
import type { ReorderBucketsInput } from '../validation/bucket.schema';

export type ReorderBucketsError = { type: 'invalid_ids'; message: string; missingIds: string[] } | { type: 'incomplete'; message: string };

export type ReorderBucketsResult = { success: true } | { success: false; error: ReorderBucketsError };

export async function reorderBuckets(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	input: ReorderBucketsInput
): Promise<ReorderBucketsResult> {
	// Fetch all buckets for this user
	const userBuckets = await db.select({ id: bucket.id }).from(bucket).where(eq(bucket.userId, userId));

	const userBucketIds = new Set(userBuckets.map((b) => b.id));

	// Validate that all provided IDs belong to this user
	const missingIds = input.bucketIds.filter((id) => !userBucketIds.has(id));
	if (missingIds.length > 0) {
		return {
			success: false,
			error: {
				type: 'invalid_ids',
				message: 'Some bucket IDs do not belong to this user',
				missingIds,
			},
		};
	}

	// Validate that all user buckets are included
	const providedIds = new Set(input.bucketIds);
	const missingUserIds = userBuckets.filter((b) => !providedIds.has(b.id)).map((b) => b.id);
	if (missingUserIds.length > 0) {
		return {
			success: false,
			error: {
				type: 'incomplete',
				message: 'All user buckets must be included in the reorder',
			},
		};
	}

	// Update order for each bucket
	// Use Promise.all for parallel updates (each is independent)
	await Promise.all(
		input.bucketIds.map((bucketId, index) =>
			db
				.update(bucket)
				.set({ order: index })
				.where(and(eq(bucket.id, bucketId), eq(bucket.userId, userId)))
		)
	);

	return { success: true };
}
