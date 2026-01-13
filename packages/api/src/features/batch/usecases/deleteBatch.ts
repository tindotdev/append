/**
 * Use case: Delete a batch and all its candidates.
 *
 * Performs a hard delete - candidates are automatically
 * removed via foreign key cascade.
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
