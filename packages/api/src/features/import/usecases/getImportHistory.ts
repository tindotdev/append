/**
 * Get import history: list past import runs for a user.
 */

import { desc, eq, inArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { importFile, importRun, type schema } from '../../../db';

export interface ImportHistoryItem {
	id: string;
	importId: string;
	status: 'pending' | 'done' | 'error';
	termCreatedCount: number;
	termSenseCreatedCount: number;
	flaggedCount: number;
	skippedCount: number;
	createdAt: Date;
	completedAt: Date | null;
	files: Array<{
		id: string;
		filename: string;
		size: number;
		entriesImported: number;
	}>;
}

export interface GetImportHistoryResult {
	items: ImportHistoryItem[];
	hasMore: boolean;
}

/**
 * Get import history for a user.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - Authenticated user ID
 * @param limit - Maximum number of results (default 20)
 * @param cursor - Optional cursor (import run ID) for pagination
 * @returns Paginated list of import runs with their files
 */
export async function getImportHistory(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	limit = 20,
	_cursor?: string
): Promise<GetImportHistoryResult> {
	// Build base query
	const query = db
		.select({
			id: importRun.id,
			importId: importRun.importId,
			status: importRun.status,
			termCreatedCount: importRun.termCreatedCount,
			termSenseCreatedCount: importRun.termSenseCreatedCount,
			flaggedCount: importRun.flaggedCount,
			skippedCount: importRun.skippedCount,
			createdAt: importRun.createdAt,
			completedAt: importRun.completedAt,
		})
		.from(importRun)
		.where(eq(importRun.userId, userId))
		.orderBy(desc(importRun.createdAt))
		.limit(limit + 1); // Fetch one extra to check for more

	// TODO: Add cursor-based pagination if needed

	const runs = await query;

	// Check if there are more results
	const hasMore = runs.length > limit;
	const resultRuns = hasMore ? runs.slice(0, limit) : runs;

	// Fetch files for each run
	const runIds = resultRuns.map((r) => r.id);
	let files: Array<{
		id: string;
		importRunId: string;
		filename: string;
		size: number;
		entriesImported: number;
	}> = [];

	if (runIds.length > 0) {
		// Fetch files for all runs in one query
		files = await db
			.select({
				id: importFile.id,
				importRunId: importFile.importRunId,
				filename: importFile.filename,
				size: importFile.size,
				entriesImported: importFile.entriesImported,
			})
			.from(importFile)
			.where(inArray(importFile.importRunId, runIds));
	}

	// Group files by run ID
	const filesByRunId = new Map<
		string,
		Array<{
			id: string;
			filename: string;
			size: number;
			entriesImported: number;
		}>
	>();
	for (const file of files) {
		const existing = filesByRunId.get(file.importRunId) ?? [];
		existing.push({
			id: file.id,
			filename: file.filename,
			size: file.size,
			entriesImported: file.entriesImported,
		});
		filesByRunId.set(file.importRunId, existing);
	}

	// Build result items
	const items: ImportHistoryItem[] = resultRuns.map((run) => ({
		id: run.id,
		importId: run.importId,
		status: run.status,
		termCreatedCount: run.termCreatedCount,
		termSenseCreatedCount: run.termSenseCreatedCount,
		flaggedCount: run.flaggedCount,
		skippedCount: run.skippedCount,
		createdAt: run.createdAt,
		completedAt: run.completedAt,
		files: filesByRunId.get(run.id) ?? [],
	}));

	return { items, hasMore };
}
