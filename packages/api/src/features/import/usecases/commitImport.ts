/**
 * Commit import: create terms and senses from parsed markdown files.
 *
 * Follows the pattern from acceptAll.ts for idempotent D1 batch writes.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket as bucketTable, idempotencyKey, normalize, type schema, type TermSenseSource, term, termSense } from '../../../db';
import { sha256Hex } from '../../../shared/crypto';
import { checkIdempotencyKey } from '../../../shared/idempotency/keys';
import { decodeJsonResultRef, encodeJsonResultRef } from '../../../shared/idempotency/result-ref';
import { parseMarkdown } from '../parser/parseMarkdown';
import type { CommitImportInput, CommitImportResponse } from '../validation/import.schema';
import { getFileContent, listImportFiles } from './uploadFiles';

/**
 * SQLite/D1 has a limit on variables per query (~99 for D1).
 * Batch large IN queries to avoid "too many SQL variables" error.
 */
const BATCH_SIZE = 50;

/**
 * Split an array into chunks of specified size.
 */
function chunk<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

/**
 * Idempotency scope for import commit.
 */
const IMPORT_COMMIT_SCOPE = 'import_commit' as const;

/**
 * Error types for commit import.
 */
export type CommitImportError =
	| { type: 'not_found'; message: string }
	| { type: 'bucket_limit_exceeded'; message: string }
	| { type: 'idempotency_conflict'; originalImportId: string }
	| { type: 'internal_error'; message: string };

export type CommitImportOutcome =
	| { success: true; result: CommitImportResponse; isReplay: boolean }
	| { success: false; error: CommitImportError };

interface EntryWithBucket {
	term: string;
	definition: string;
	bucketId: string;
	r2Key: string;
}

/**
 * Commit an import by creating terms and senses.
 *
 * @param db - Drizzle D1 database instance
 * @param rawDb - Raw D1 database for batch operations
 * @param r2 - R2 bucket binding
 * @param userId - Authenticated user ID
 * @param input - Validated commit input
 * @returns Commit result or error
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates import commit with conflict detection
export async function commitImport(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	r2: R2Bucket,
	userId: string,
	input: CommitImportInput
): Promise<CommitImportOutcome> {
	const { clientRequestId, importId, bucketMappings } = input;

	// Verify import exists in R2
	const r2Objects = await listImportFiles(r2, userId, importId);
	if (!r2Objects) {
		return {
			success: false,
			error: { type: 'not_found', message: 'Import not found' },
		};
	}

	// Build bucket mapping lookup: r2Key → bucketId
	const bucketMappingMap = new Map<string, string>();
	for (const mapping of bucketMappings) {
		bucketMappingMap.set(mapping.r2Key, mapping.bucketId);
	}

	// Check idempotency key
	const requestHash = await sha256Hex(`import:${importId}`);
	const idempotencyCheck = await checkIdempotencyKey(db, userId, IMPORT_COMMIT_SCOPE, clientRequestId, requestHash);

	if (idempotencyCheck.status === 'replay') {
		const cachedResult = decodeJsonResultRef<CommitImportResponse>('import_summary', idempotencyCheck.resultRef);
		if (!cachedResult) {
			return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
		}

		return { success: true, result: cachedResult, isReplay: true };
	}

	if (idempotencyCheck.status === 'conflict') {
		return { success: false, error: { type: 'idempotency_conflict', originalImportId: importId } };
	}

	// Parse all files and collect entries
	const allEntries = await collectImportEntries(r2, r2Objects, bucketMappingMap);

	// Verify all bucket IDs exist
	const uniqueBucketIds = [...new Set(allEntries.map((e) => e.bucketId))];
	const existingBuckets = await db
		.select({ id: bucketTable.id, slug: bucketTable.slug })
		.from(bucketTable)
		.where(and(eq(bucketTable.userId, userId), inArray(bucketTable.id, uniqueBucketIds)));

	const existingBucketIds = new Set(existingBuckets.map((b) => b.id));

	// Check for missing buckets
	for (const bucketId of uniqueBucketIds) {
		if (!existingBucketIds.has(bucketId)) {
			return {
				success: false,
				error: { type: 'not_found', message: `Bucket not found: ${bucketId}` },
			};
		}
	}

	// Build bucket ID → slug mapping for termSense.bucket field
	const bucketIdToSlug = new Map<string, string>();
	for (const b of existingBuckets) {
		bucketIdToSlug.set(b.id, b.slug);
	}

	// Get unique canonicals
	const uniqueCanonicals = [...new Set(allEntries.map((e) => normalize(e.term)))];

	// Pre-fetch existing terms (batched to avoid D1 variable limit)
	interface ExistingTermRow {
		id: string;
		canonical: string;
		primarySenseId: string | null;
	}
	const existingTerms: ExistingTermRow[] = [];
	if (uniqueCanonicals.length > 0) {
		const canonicalBatches = chunk(uniqueCanonicals, BATCH_SIZE);
		for (const batch of canonicalBatches) {
			const batchResults = await db
				.select({
					id: term.id,
					canonical: term.canonical,
					primarySenseId: term.primarySenseId,
				})
				.from(term)
				.where(and(eq(term.userId, userId), inArray(term.canonical, batch)));
			existingTerms.push(...batchResults);
		}
	}

	// Build map of existing terms
	const existingTermMap = new Map<string, { termId: string; primarySenseId: string | null }>();
	for (const t of existingTerms) {
		existingTermMap.set(t.canonical, { termId: t.id, primarySenseId: t.primarySenseId });
	}

	// Pre-fetch primary sense buckets (batched to avoid D1 variable limit)
	const primarySenseIds = existingTerms.map((t) => t.primarySenseId).filter((id): id is string => id !== null);

	interface PrimarySenseRow {
		id: string;
		bucket: string;
	}
	const primarySenses: PrimarySenseRow[] = [];
	if (primarySenseIds.length > 0) {
		const senseIdBatches = chunk(primarySenseIds, BATCH_SIZE);
		for (const batch of senseIdBatches) {
			const batchResults = await db.select({ id: termSense.id, bucket: termSense.bucket }).from(termSense).where(inArray(termSense.id, batch));
			primarySenses.push(...batchResults);
		}
	}

	const primarySenseBucketMap = new Map<string, string>();
	for (const ps of primarySenses) {
		primarySenseBucketMap.set(ps.id, ps.bucket);
	}

	// Build canonical → termId map
	const canonicalToTermId = new Map<string, string>();
	const newTermCanonicals = new Set<string>();

	for (const entry of allEntries) {
		const canonical = normalize(entry.term);
		if (!canonicalToTermId.has(canonical)) {
			const existing = existingTermMap.get(canonical);
			if (existing) {
				canonicalToTermId.set(canonical, existing.termId);
			} else {
				const newTermId = crypto.randomUUID();
				canonicalToTermId.set(canonical, newTermId);
				newTermCanonicals.add(canonical);
			}
		}
	}

	// Generate D1 batch statements
	const now = new Date();
	const statements: D1PreparedStatement[] = [];

	// Counters
	let termCreatedCount = 0;
	let termSenseCreatedCount = 0;
	let flaggedCount = 0;
	let skippedCount = 0;

	// Track processed entries to avoid duplicates within the same import
	const processedEntries = new Set<string>();

	for (const entry of allEntries) {
		const canonical = normalize(entry.term);
		const bucketSlug = bucketIdToSlug.get(entry.bucketId);
		if (!bucketSlug) continue;

		// Create unique key for dedup within import
		const entryKey = `${canonical}:${entry.bucketId}:${entry.definition}`;
		if (processedEntries.has(entryKey)) {
			skippedCount++;
			continue;
		}
		processedEntries.add(entryKey);

		const termId = canonicalToTermId.get(canonical);
		if (!termId) continue;

		const termSenseId = crypto.randomUUID();

		// Create term if new
		if (newTermCanonicals.has(canonical)) {
			const termStmt = db
				.insert(term)
				.values({
					id: termId,
					userId,
					canonical,
					displayTerm: entry.term,
					primarySenseId: termSenseId,
					createdAt: now,
				})
				.onConflictDoNothing()
				.toSQL();

			statements.push(rawDb.prepare(termStmt.sql).bind(...termStmt.params));
			termCreatedCount++;
			newTermCanonicals.delete(canonical); // Only create once
		}

		// Determine flagged reason (bucket conflict with primary sense)
		let flaggedReason: string | null = null;
		const existingTermInfo = existingTermMap.get(canonical);
		if (existingTermInfo?.primarySenseId) {
			const primaryBucket = primarySenseBucketMap.get(existingTermInfo.primarySenseId);
			if (primaryBucket && primaryBucket !== bucketSlug) {
				flaggedReason = 'bucket_conflict';
				flaggedCount++;
			}
		}

		// Create sense
		const senseStmt = db
			.insert(termSense)
			.values({
				id: termSenseId,
				termId,
				bucket: bucketSlug,
				bucketId: entry.bucketId,
				text: entry.definition,
				source: 'import' as TermSenseSource,
				flaggedReason,
				createdAt: now,
			})
			.onConflictDoNothing()
			.toSQL();

		statements.push(rawDb.prepare(senseStmt.sql).bind(...senseStmt.params));
		termSenseCreatedCount++;
	}

	// Build result
	const result: CommitImportResponse = {
		status: 'done',
		stats: {
			termCreatedCount,
			termSenseCreatedCount,
			bucketCreatedCount: 0, // Buckets must exist before commit
			flaggedCount,
			skippedCount,
		},
		bucketsCreated: [],
	};

	// Insert idempotency key
	const resultRef = encodeJsonResultRef('import_summary', result);
	const idempStmt = db
		.insert(idempotencyKey)
		.values({
			userId,
			scope: IMPORT_COMMIT_SCOPE,
			key: clientRequestId,
			requestHash,
			resultRef,
			createdAt: now,
		})
		.toSQL();

	statements.push(rawDb.prepare(idempStmt.sql).bind(...idempStmt.params));

	// Execute all statements atomically
	try {
		await rawDb.batch(statements);
	} catch (error) {
		// Handle race condition on idempotency key
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			const racedKey = await db.query.idempotencyKey.findFirst({
				where: and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.scope, IMPORT_COMMIT_SCOPE), eq(idempotencyKey.key, clientRequestId)),
			});

			if (racedKey) {
				if (racedKey.requestHash === requestHash) {
					const cachedResult = decodeJsonResultRef<CommitImportResponse>('import_summary', racedKey.resultRef);
					if (cachedResult) {
						return { success: true, result: cachedResult, isReplay: true };
					}
				} else {
					return { success: false, error: { type: 'idempotency_conflict', originalImportId: importId } };
				}
			}
		}

		console.error('Import commit error:', error);
		return { success: false, error: { type: 'internal_error', message: 'Failed to commit import' } };
	}

	return { success: true, result, isReplay: false };
}

async function collectImportEntries(
	r2: R2Bucket,
	objects: { key: string }[],
	bucketMappingMap: Map<string, string>
): Promise<EntryWithBucket[]> {
	const entries: EntryWithBucket[] = [];

	for (const obj of objects) {
		const content = await getFileContent(r2, obj.key);
		if (!content) continue;

		const { entries: parsedEntries } = parseMarkdown(content);
		const bucketId = bucketMappingMap.get(obj.key);

		// Skip files without bucket mapping
		if (!bucketId) continue;

		for (const entry of parsedEntries) {
			// Skip inbox items (no definition)
			if (entry.isInbox || !entry.definition) continue;

			entries.push({
				term: entry.term,
				definition: entry.definition,
				bucketId,
				r2Key: obj.key,
			});
		}
	}

	return entries;
}
