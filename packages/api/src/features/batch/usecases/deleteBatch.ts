/**
 * Use case: Delete a batch and all its candidates.
 *
 * Performs a hard delete - candidates are automatically
 * removed via foreign key cascade.
 *
 * Exception to soft-delete policy (CLAUDE.md): Batches are transient
 * staging data for the capture → suggest → accept flow. Once candidates
 * are accepted, the materialized Term/TermSense rows persist independently.
 * Hard delete is acceptable here since:
 * - Batches have no audit/compliance requirements
 * - Accepted terms are preserved via materialization pointers
 * - Users expect "delete batch" to remove the staging data completely
 */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { batch, type schema } from '../../../db';
import { requireBatchOwned } from '../../../shared/queries';

/**
 * Error types for delete batch.
 */
export type DeleteBatchError = { type: 'not_found' } | { type: 'forbidden' };

/**
 * Delete a batch and all its candidates.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID (for ownership verification)
 * @param batchId - Batch ID to delete
 * @returns Success or error result
 */
export async function deleteBatch(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	batchId: string
): Promise<{ success: true } | { success: false; error: DeleteBatchError }> {
	// Verify batch exists and user owns it
	const batchOwnership = await requireBatchOwned(db, userId, batchId);
	if (!batchOwnership.ok) {
		return { success: false, error: { type: batchOwnership.error } };
	}

	// Delete the batch (candidates cascade automatically)
	await db.delete(batch).where(eq(batch.id, batchId));

	return { success: true };
}
