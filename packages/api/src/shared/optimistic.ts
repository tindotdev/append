/**
 * Optimistic locking utilities.
 *
 * Provides helpers for version-based optimistic concurrency control
 * in database updates.
 */

import { sql } from 'drizzle-orm';

export type OptimisticConflictResult = { status: 'not_found' } | { status: 'version_conflict'; currentVersion: number };

export type OptimisticError = { type: 'not_found' } | { type: 'version_conflict'; currentVersion: number };

export async function resolveOptimisticConflict<T extends NonNullable<unknown>>(
	fetchCurrent: () => Promise<T | null | undefined>,
	getVersion: (row: T) => number
): Promise<OptimisticConflictResult> {
	const current = await fetchCurrent();

	if (!current) {
		return { status: 'not_found' };
	}

	return { status: 'version_conflict', currentVersion: getVersion(current) };
}

export function toOptimisticError(conflict: OptimisticConflictResult): OptimisticError {
	if (conflict.status === 'not_found') {
		return { type: 'not_found' };
	}

	return { type: 'version_conflict', currentVersion: conflict.currentVersion };
}

/**
 * Increment version for optimistic locking.
 *
 * Returns a SQL fragment that increments the version column by 1.
 * Use this in `.set()` calls for entities with optimistic locking.
 *
 * @param table - The Drizzle table schema
 * @returns SQL fragment for version increment
 *
 * @example
 * ```typescript
 * await db.update(term)
 *   .set({
 *     archivedAt: now,
 *     version: incrementVersion(term),
 *   })
 *   .where(eq(term.id, termId));
 * ```
 */
export function incrementVersion(table: any) {
	return sql`${table.version} + 1`;
}
