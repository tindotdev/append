/**
 * Create a new bucket for a user.
 * Validates bucket limit and slug uniqueness.
 */

import { and, count, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket, type schema } from '../../../db';
import { MAX_BUCKETS_PER_USER } from '../../../db/default-buckets';
import type { CreateBucketInput } from '../validation/bucket.schema';

export type CreateBucketError = { type: 'limit_exceeded'; message: string } | { type: 'slug_exists'; message: string };

export type CreateBucketResult = { success: true; result: { id: string } } | { success: false; error: CreateBucketError };

export async function createBucket(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	input: CreateBucketInput
): Promise<CreateBucketResult> {
	// Check bucket count limit
	const [{ value: bucketCount }] = await db.select({ value: count() }).from(bucket).where(eq(bucket.userId, userId));

	if (bucketCount >= MAX_BUCKETS_PER_USER) {
		return {
			success: false,
			error: {
				type: 'limit_exceeded',
				message: `Maximum ${MAX_BUCKETS_PER_USER} buckets per user`,
			},
		};
	}

	// Check slug uniqueness for this user
	const existing = await db
		.select({ id: bucket.id })
		.from(bucket)
		.where(and(eq(bucket.userId, userId), eq(bucket.slug, input.slug)))
		.limit(1);

	if (existing.length > 0) {
		return {
			success: false,
			error: {
				type: 'slug_exists',
				message: `Bucket with slug '${input.slug}' already exists`,
			},
		};
	}

	// Get next order value (find max and add 1)
	const [maxOrder] = await db.select({ value: bucket.order }).from(bucket).where(eq(bucket.userId, userId)).orderBy(bucket.order).limit(1);

	const nextOrder = maxOrder ? maxOrder.value + 1 : 0;

	// Generate ID
	const id = crypto.randomUUID();

	// Insert bucket
	await db.insert(bucket).values({
		id,
		userId,
		slug: input.slug,
		name: input.name,
		description: input.description,
		color: input.color ?? null,
		order: nextOrder,
	});

	return { success: true, result: { id } };
}
