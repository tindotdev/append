/**
 * Commit import: create terms and senses from parsed markdown files.
 *
 * Follows the pattern from acceptAll.ts for idempotent D1 batch writes.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket as bucketTable, importFile, importRun, normalize, type schema, type TermSenseSource, term, termSense } from '../../../db';
import { sha256Hex } from '../../../shared/crypto';
import { checkIdempotencyKey, createIdempotencyKeyStatement, findIdempotencyKey } from '../../../shared/idempotency/keys';
import { decodeJsonResultRef, encodeJsonResultRef } from '../../../shared/idempotency/result-ref';
import type { CommitImportInput, CommitImportResponse } from '../validation/import.schema';
import { parseImportFile } from './parseImportFile';
import { requireImportFiles } from './uploadFiles';

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

interface FileInfo {
	r2Key: string;
	filename: string;
	size: number;
	bucketId: string | null;
	entriesCount: number;
}

interface ExistingTermRow {
	id: string;
	canonical: string;
	primarySenseId: string | null;
}

interface PrimarySenseRow {
	id: string;
	bucket: string;
}

function buildBucketMappingMap(bucketMappings: CommitImportInput['bucketMappings']): Map<string, string> {
	const bucketMappingMap = new Map<string, string>();
	for (const mapping of bucketMappings) {
		bucketMappingMap.set(mapping.r2Key, mapping.bucketId);
	}
	return bucketMappingMap;
}

async function loadExistingTerms(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	uniqueCanonicals: string[]
): Promise<ExistingTermRow[]> {
	const existingTerms: ExistingTermRow[] = [];
	if (uniqueCanonicals.length === 0) {
		return existingTerms;
	}

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

	return existingTerms;
}

async function loadPrimarySenseBuckets(db: DrizzleD1Database<typeof schema>, primarySenseIds: string[]): Promise<PrimarySenseRow[]> {
	const primarySenses: PrimarySenseRow[] = [];
	if (primarySenseIds.length === 0) {
		return primarySenses;
	}

	const senseIdBatches = chunk(primarySenseIds, BATCH_SIZE);
	for (const batch of senseIdBatches) {
		const batchResults = await db.select({ id: termSense.id, bucket: termSense.bucket }).from(termSense).where(inArray(termSense.id, batch));
		primarySenses.push(...batchResults);
	}

	return primarySenses;
}

function buildExistingTermMap(existingTerms: ExistingTermRow[]): Map<string, { termId: string; primarySenseId: string | null }> {
	const existingTermMap = new Map<string, { termId: string; primarySenseId: string | null }>();
	for (const t of existingTerms) {
		existingTermMap.set(t.canonical, { termId: t.id, primarySenseId: t.primarySenseId });
	}
	return existingTermMap;
}

function buildPrimarySenseBucketMap(primarySenses: PrimarySenseRow[]): Map<string, string> {
	const primarySenseBucketMap = new Map<string, string>();
	for (const ps of primarySenses) {
		primarySenseBucketMap.set(ps.id, ps.bucket);
	}
	return primarySenseBucketMap;
}

function buildCanonicalTermMaps(
	entries: EntryWithBucket[],
	existingTermMap: Map<string, { termId: string; primarySenseId: string | null }>
): { canonicalToTermId: Map<string, string>; newTermCanonicals: Set<string> } {
	const canonicalToTermId = new Map<string, string>();
	const newTermCanonicals = new Set<string>();

	for (const entry of entries) {
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

	return { canonicalToTermId, newTermCanonicals };
}

async function loadBucketSlugMap(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	bucketIds: string[]
): Promise<
	| { ok: true; existingBuckets: { id: string; slug: string }[]; bucketIdToSlug: Map<string, string> }
	| { ok: false; error: CommitImportError }
> {
	const existingBuckets = await db
		.select({ id: bucketTable.id, slug: bucketTable.slug })
		.from(bucketTable)
		.where(and(eq(bucketTable.userId, userId), inArray(bucketTable.id, bucketIds)));

	const existingBucketIds = new Set(existingBuckets.map((b) => b.id));
	for (const bucketId of bucketIds) {
		if (!existingBucketIds.has(bucketId)) {
			return { ok: false, error: { type: 'not_found', message: `Bucket not found: ${bucketId}` } };
		}
	}

	const bucketIdToSlug = new Map<string, string>();
	for (const b of existingBuckets) {
		bucketIdToSlug.set(b.id, b.slug);
	}

	return { ok: true, existingBuckets, bucketIdToSlug };
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
	const importFiles = await requireImportFiles(r2, userId, importId);
	if (!importFiles.ok) {
		return { success: false, error: importFiles.error };
	}
	const r2Objects = importFiles.objects;

	// Build bucket mapping lookup: r2Key → bucketId
	const bucketMappingMap = buildBucketMappingMap(bucketMappings);

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
	const { entries: allEntries, files: fileInfos } = await collectImportEntries(r2, r2Objects, bucketMappingMap);

	// Verify all bucket IDs exist
	const uniqueBucketIds = [...new Set(allEntries.map((e) => e.bucketId))];
	const bucketLookup = await loadBucketSlugMap(db, userId, uniqueBucketIds);
	if (!bucketLookup.ok) {
		return { success: false, error: bucketLookup.error };
	}
	const { bucketIdToSlug } = bucketLookup;

	// Get unique canonicals
	const uniqueCanonicals = [...new Set(allEntries.map((e) => normalize(e.term)))];

	// Pre-fetch existing terms (batched to avoid D1 variable limit)
	const existingTerms = await loadExistingTerms(db, userId, uniqueCanonicals);

	// Build map of existing terms
	const existingTermMap = buildExistingTermMap(existingTerms);

	// Pre-fetch primary sense buckets (batched to avoid D1 variable limit)
	const primarySenseIds = existingTerms.map((t) => t.primarySenseId).filter((id): id is string => id !== null);

	const primarySenses = await loadPrimarySenseBuckets(db, primarySenseIds);
	const primarySenseBucketMap = buildPrimarySenseBucketMap(primarySenses);

	// Build canonical → termId map
	const { canonicalToTermId, newTermCanonicals } = buildCanonicalTermMaps(allEntries, existingTermMap);

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

	// Create import history records
	const importRunId = crypto.randomUUID();
	const importRunStmt = db
		.insert(importRun)
		.values({
			id: importRunId,
			userId,
			importId,
			status: 'done',
			termCreatedCount,
			termSenseCreatedCount,
			flaggedCount,
			skippedCount,
			createdAt: now,
			completedAt: now,
		})
		.onConflictDoNothing()
		.toSQL();
	statements.push(rawDb.prepare(importRunStmt.sql).bind(...importRunStmt.params));

	// Create import file records
	for (const file of fileInfos) {
		const importFileId = crypto.randomUUID();
		const importFileStmt = db
			.insert(importFile)
			.values({
				id: importFileId,
				importRunId,
				filename: file.filename,
				r2Key: file.r2Key,
				size: file.size,
				bucketId: file.bucketId,
				entriesImported: file.entriesCount,
				createdAt: now,
			})
			.toSQL();
		statements.push(rawDb.prepare(importFileStmt.sql).bind(...importFileStmt.params));
	}

	// Insert idempotency key
	const resultRef = encodeJsonResultRef('import_summary', result);
	const idempStmt = createIdempotencyKeyStatement(db, userId, IMPORT_COMMIT_SCOPE, clientRequestId, requestHash, resultRef, {
		createdAt: now,
	}).toSQL();

	statements.push(rawDb.prepare(idempStmt.sql).bind(...idempStmt.params));

	// Execute all statements atomically
	try {
		await rawDb.batch(statements);
	} catch (error) {
		// Handle race condition on idempotency key
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			const racedKey = await findIdempotencyKey(db, userId, IMPORT_COMMIT_SCOPE, clientRequestId);

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

interface CollectResult {
	entries: EntryWithBucket[];
	files: FileInfo[];
}

async function collectImportEntries(
	r2: R2Bucket,
	objects: { key: string; size: number }[],
	bucketMappingMap: Map<string, string>
): Promise<CollectResult> {
	const entries: EntryWithBucket[] = [];
	const files: FileInfo[] = [];

	for (const obj of objects) {
		const parsed = await parseImportFile(r2, obj);
		if (!parsed) continue;

		const { entries: parsedEntries, filename } = parsed;
		const bucketId = bucketMappingMap.get(obj.key) ?? null;

		let fileEntryCount = 0;

		for (const entry of parsedEntries) {
			// Skip inbox items (no definition)
			if (entry.isInbox || !entry.definition) continue;
			// Skip files without bucket mapping for entry collection (not for file tracking)
			if (!bucketId) continue;

			entries.push({
				term: entry.term,
				definition: entry.definition,
				bucketId,
				r2Key: obj.key,
			});
			fileEntryCount++;
		}

		files.push({
			r2Key: obj.key,
			filename,
			size: obj.size,
			bucketId,
			entriesCount: fileEntryCount,
		});
	}

	return { entries, files };
}
