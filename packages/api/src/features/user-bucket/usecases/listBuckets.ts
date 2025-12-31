/**
 * List all buckets for a user, ordered by `order` field.
 * Includes count of active term senses in each bucket.
 */

import { eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket, type schema } from '../../../db';

export interface BucketWithCount {
	id: string;
	slug: string;
	name: string;
	description: string;
	color: string | null;
	order: number;
	senseCount: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface ListBucketsResult {
	buckets: BucketWithCount[];
}

export async function listBuckets(db: DrizzleD1Database<typeof schema>, userId: string): Promise<ListBucketsResult> {
	// Query buckets with sense counts using a subquery
	const buckets = await db
		.select({
			id: bucket.id,
			slug: bucket.slug,
			name: bucket.name,
			description: bucket.description,
			color: bucket.color,
			order: bucket.order,
			createdAt: bucket.createdAt,
			updatedAt: bucket.updatedAt,
			senseCount: sql<number>`(
				SELECT COUNT(*)
				FROM term_sense ts
				JOIN term t ON t.id = ts.term_id
				WHERE ts.bucket_id = ${bucket.id}
				AND t.user_id = ${userId}
				AND ts.archived_at IS NULL
				AND t.archived_at IS NULL
			)`.as('sense_count'),
		})
		.from(bucket)
		.where(eq(bucket.userId, userId))
		.orderBy(bucket.order);

	return {
		buckets: buckets.map((b) => ({
			...b,
			senseCount: Number(b.senseCount),
		})),
	};
}
