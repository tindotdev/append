/**
 * Preview import: parse uploaded files and return preview with stats.
 */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../../../db';
import { bucket as bucketTable, normalize, term as termTable } from '../../../db/domain.schema';
import { suggestBucketSlug } from '../parser/suggestBucket';
import type { ParsedFilePreview, PreviewImportResponse } from '../validation/import.schema';
import { parseImportFile } from './parseImportFile';
import { requireImportFiles } from './uploadFiles';

export interface PreviewImportError {
	type: 'not_found';
	message: string;
}

export type PreviewImportOutcome = { success: true; result: PreviewImportResponse } | { success: false; error: PreviewImportError };

/**
 * Preview an import by parsing uploaded files and returning stats.
 *
 * @param db - Drizzle database instance
 * @param r2 - R2 bucket binding
 * @param userId - Authenticated user ID
 * @param importId - Import ID to preview
 * @returns Preview with parsed entries and stats
 */
export async function previewImport(
	db: DrizzleD1Database<typeof schema>,
	r2: R2Bucket,
	userId: string,
	importId: string
): Promise<PreviewImportOutcome> {
	// List files for this import
	const importFiles = await requireImportFiles(r2, userId, importId);
	if (!importFiles.ok) {
		return { success: false, error: importFiles.error };
	}
	const r2Objects = importFiles.objects;

	// Parse each file
	const parsedFiles: ParsedFilePreview[] = [];
	let totalEntries = 0;
	let entriesWithDefinition = 0;
	let inboxEntries = 0;

	// Collect all normalized terms for dedup check
	const allNormalizedTerms = new Set<string>();

	for (const obj of r2Objects) {
		const parsed = await parseImportFile(r2, obj);
		if (!parsed) continue;
		const { entries, warnings, filename } = parsed;

		// Suggest bucket from filename
		const suggestedBucketSlug = suggestBucketSlug(filename);

		// Count stats
		for (const entry of entries) {
			totalEntries++;
			if (entry.isInbox) {
				inboxEntries++;
			} else {
				entriesWithDefinition++;
			}
			allNormalizedTerms.add(normalize(entry.term));
		}

		parsedFiles.push({
			filename,
			r2Key: obj.key,
			suggestedBucketSlug,
			entries: entries.map((e) => ({
				term: e.term,
				definition: e.definition,
				lineNumber: e.lineNumber,
				isInbox: e.isInbox,
			})),
			warnings,
		});
	}

	// Check which terms already exist
	const existingTerms = await db.select({ canonical: termTable.canonical }).from(termTable).where(eq(termTable.userId, userId));

	const existingCanonicals = new Set(existingTerms.map((t) => t.canonical));

	let existingCount = 0;
	let newCount = 0;
	for (const normalized of allNormalizedTerms) {
		if (existingCanonicals.has(normalized)) {
			existingCount++;
		} else {
			newCount++;
		}
	}

	// Get user's existing buckets
	const existingBuckets = await db
		.select({
			id: bucketTable.id,
			slug: bucketTable.slug,
			name: bucketTable.name,
		})
		.from(bucketTable)
		.where(eq(bucketTable.userId, userId))
		.orderBy(bucketTable.order);

	return {
		success: true,
		result: {
			importId,
			parsedFiles,
			stats: {
				totalEntries,
				entriesWithDefinition,
				inboxEntries,
				existingTerms: existingCount,
				newTerms: newCount,
			},
			existingBuckets,
		},
	};
}
