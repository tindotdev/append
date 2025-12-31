/**
 * Update a bucket's name, description, or color.
 * Slug cannot be changed (immutable after creation).
 */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket, type schema } from '../../../db';
import type { UpdateBucketInput } from '../validation/bucket.schema';

export type UpdateBucketError = { type: 'not_found'; message: string } | { type: 'forbidden'; message: string };

export type UpdateBucketResult = { success: true; result: { id: string } } | { success: false; error: UpdateBucketError };

export async function updateBucket(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	bucketId: string,
	input: UpdateBucketInput
): Promise<UpdateBucketResult> {
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

	// Build update object (only include provided fields)
	const updates: Partial<{
		name: string;
		description: string;
		color: string | null;
	}> = {};

	if (input.name !== undefined) {
		updates.name = input.name;
	}
	if (input.description !== undefined) {
		updates.description = input.description;
	}
	if (input.color !== undefined) {
		updates.color = input.color ?? null;
	}

	// Only update if there are changes
	if (Object.keys(updates).length > 0) {
		await db
			.update(bucket)
			.set(updates)
			.where(and(eq(bucket.id, bucketId), eq(bucket.userId, userId)));
	}

	return { success: true, result: { id: bucketId } };
}
