import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { batch, bucket, type schema } from '../db';

export type OwnershipResult<T> = { ok: true; value: T } | { ok: false; error: 'not_found' | 'forbidden' };

export async function requireBatchOwned(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	batchId: string
): Promise<OwnershipResult<typeof batch.$inferSelect>> {
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
	});

	if (!batchRow) {
		return { ok: false, error: 'not_found' };
	}

	if (batchRow.userId !== userId) {
		return { ok: false, error: 'forbidden' };
	}

	return { ok: true, value: batchRow };
}

export async function requireBucketOwned(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	bucketId: string
): Promise<OwnershipResult<{ id: string; userId: string }>> {
	const bucketRow = await db.query.bucket.findFirst({
		where: eq(bucket.id, bucketId),
		columns: { id: true, userId: true },
	});

	if (!bucketRow) {
		return { ok: false, error: 'not_found' };
	}

	if (bucketRow.userId !== userId) {
		return { ok: false, error: 'forbidden' };
	}

	return { ok: true, value: bucketRow };
}

export async function findUserBucketBySlug(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	slug: string
): Promise<{ id: string; slug: string; name: string } | null> {
	const bucketRow = await db.query.bucket.findFirst({
		where: and(eq(bucket.userId, userId), eq(bucket.slug, slug)),
		columns: { id: true, slug: true, name: true },
	});

	return bucketRow ?? null;
}

export async function requireUserBucketBySlug(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	slug: string
): Promise<{ ok: true; value: { id: string; slug: string; name: string } } | { ok: false; error: 'not_found' }> {
	const bucketRow = await findUserBucketBySlug(db, userId, slug);
	if (!bucketRow) {
		return { ok: false, error: 'not_found' };
	}

	return { ok: true, value: bucketRow };
}
