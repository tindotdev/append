/**
 * Use case: Update a term sense's text/bucket with optimistic locking.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, termSense } from '../../../db';
import { resolveOptimisticConflict, toOptimisticError } from '../../../shared/optimistic';
import { findUserBucketBySlug, requireTermOwned } from '../../../shared/queries';
import type { UpdateTermSenseInput } from '../validation/updateTermSense.schema';

/**
 * Term sense result from update.
 */
export interface TermSenseResult {
	id: string;
	termId: string;
	bucket: string;
	text: string;
	source: string;
	senseLabel: string | null;
	flaggedReason: string | null;
	version: number;
	createdAt: number;
}

/**
 * Possible errors from updateTermSense.
 */
export type UpdateTermSenseError =
	| { type: 'not_found' }
	| { type: 'forbidden' }
	| { type: 'invalid_bucket'; slug: string }
	| { type: 'version_conflict'; currentVersion: number };

/**
 * Update a term sense's text/bucket with optimistic locking.
 */
export async function updateTermSense(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	senseId: string,
	input: UpdateTermSenseInput
): Promise<{ success: true; result: TermSenseResult } | { success: false; error: UpdateTermSenseError }> {
	const { expectedVersion, text, bucket: bucketSlug } = input;

	// 1. Lookup sense and verify ownership through term
	const senseRow = await db.query.termSense.findFirst({
		where: and(eq(termSense.id, senseId), isNull(termSense.archivedAt)),
	});

	if (!senseRow) {
		return { success: false, error: { type: 'not_found' } };
	}

	// 2. Lookup parent term to verify ownership
	const termOwnership = await requireTermOwned(db, userId, senseRow.termId);
	if (!termOwnership.ok) {
		return { success: false, error: { type: termOwnership.error } };
	}

	// 3. Validate bucket exists for user (if provided) and get bucket ID
	let bucketId: string | undefined;
	if (bucketSlug) {
		const bucketRow = await findUserBucketBySlug(db, userId, bucketSlug);
		if (!bucketRow) {
			return { success: false, error: { type: 'invalid_bucket', slug: bucketSlug } };
		}
		bucketId = bucketRow.id;
	}

	// 4. Build update set (partial update semantics)
	const updateSet: Record<string, unknown> = {
		version: sql`${termSense.version} + 1`,
	};

	if (text !== undefined) {
		updateSet.text = text;
	}
	if (bucketSlug !== undefined) {
		updateSet.bucket = bucketSlug;
		updateSet.bucketId = bucketId;
	}

	// 5. Atomic conditional update with optimistic locking
	const updateResult = await db
		.update(termSense)
		.set(updateSet)
		.where(sql`${termSense.id} = ${senseId} AND ${termSense.version} = ${expectedVersion}`)
		.returning({
			id: termSense.id,
			termId: termSense.termId,
			bucket: termSense.bucket,
			text: termSense.text,
			source: termSense.source,
			senseLabel: termSense.senseLabel,
			flaggedReason: termSense.flaggedReason,
			version: termSense.version,
			createdAt: termSense.createdAt,
		});

	// 6. Handle conflict or success
	if (updateResult.length === 0) {
		const conflict = await resolveOptimisticConflict(
			() =>
				db.query.termSense.findFirst({
					where: eq(termSense.id, senseId),
				}),
			(currentSense) => currentSense.version
		);
		return { success: false, error: toOptimisticError(conflict) };
	}

	// Success - return updated sense
	const updated = updateResult[0];

	return {
		success: true,
		result: {
			id: updated.id,
			termId: updated.termId,
			bucket: updated.bucket,
			text: updated.text,
			source: updated.source,
			senseLabel: updated.senseLabel,
			flaggedReason: updated.flaggedReason,
			version: updated.version,
			createdAt: updated.createdAt.getTime(),
		},
	};
}
