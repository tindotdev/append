import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { batch, bucket, type schema } from '../db';

export type OwnershipResult<T> = { ok: true; value: T } | { ok: false; error: 'not_found' | 'forbidden' };

export async function requireBatchOwned(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	batchId: string
): Promise<OwnershipResult<{ id: string; userId: string }>> {
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
		columns: { id: true, userId: true },
	});

	if (!batchRow) {
		return { ok: false, error: 'not_found' };
	}

	if (batchRow.userId !== userId) {
		return { ok: false, error: 'forbidden' };
	}

	return { ok: true, value: batchRow };
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
