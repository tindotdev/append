/**
 * Get export history: list past exports for a user.
 */

import { desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { exportLog, type schema } from '../../../db';

export interface ExportHistoryItem {
	id: string;
	bucketSlug: string;
	bucketName: string;
	filename: string;
	entryCount: number;
	createdAt: Date;
}

export interface GetExportHistoryResult {
	items: ExportHistoryItem[];
	hasMore: boolean;
}

/**
 * Get export history for a user.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - Authenticated user ID
 * @param limit - Maximum number of results (default 20)
 * @returns Paginated list of exports
 */
export async function getExportHistory(db: DrizzleD1Database<typeof schema>, userId: string, limit = 20): Promise<GetExportHistoryResult> {
	const exports = await db
		.select({
			id: exportLog.id,
			bucketSlug: exportLog.bucketSlug,
			bucketName: exportLog.bucketName,
			filename: exportLog.filename,
			entryCount: exportLog.entryCount,
			createdAt: exportLog.createdAt,
		})
		.from(exportLog)
		.where(eq(exportLog.userId, userId))
		.orderBy(desc(exportLog.createdAt))
		.limit(limit + 1);

	const hasMore = exports.length > limit;
	const items = hasMore ? exports.slice(0, limit) : exports;

	return { items, hasMore };
}
