/**
 * Use case: Accept all candidates in a batch and materialize to terms/senses.
 *
 * Implements idempotent accept with materialization pointers per ADR 0008.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type BatchStatus, batch, bucket, candidate, normalize, type schema, type TermSenseSource, term, termSense } from '../../../db';
import { sha256Hex } from '../../../shared/crypto';
import { checkIdempotencyKey, createIdempotencyKeyStatement, findIdempotencyKey } from '../../../shared/idempotency/keys';
import { decodeJsonResultRef, encodeJsonResultRef } from '../../../shared/idempotency/result-ref';
import { requireBatchOwned } from '../../../shared/queries';
import type { AcceptAllInput, AcceptSummary } from '../validation/acceptAll.schema';

/**
 * Idempotency scope for accept all.
 */
const ACCEPT_ALL_SCOPE = 'accept_all' as const;

/**
 * Error types for accept all.
 */
export type AcceptAllError =
	| { type: 'not_found' }
	| { type: 'forbidden' }
	| { type: 'suggestions_in_progress'; candidateIds: string[] }
	| { type: 'missing_effective_fields'; candidateIds: string[] }
	| { type: 'idempotency_conflict'; originalBatchId: string }
	| { type: 'internal_error'; message: string };

type CandidateRow = {
	id: string;
	position: number;
	term: string;
	normalizedTerm: string;
	chosenBucket: string | null;
	chosenText: string | null;
	suggestedBucket: string | null;
	suggestedText: string | null;
	suggestionStatus: string | null;
	materializedTermId: string | null;
	materializedTermSenseId: string | null;
};

type CandidateWithEffective = CandidateRow & {
	effectiveBucket: string | null;
	effectiveText: string | null;
};

/**
 * Accept all candidates in a batch.
 *
 * @param db - Drizzle D1 database instance
 * @param rawDb - Raw D1 database for batch operations
 * @param userId - User ID
 * @param batchId - Batch ID
 * @param input - Validated input with clientRequestId
 * @returns Accept summary or error
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates batch accept with conflict detection
export async function acceptAll(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	batchId: string,
	input: AcceptAllInput
): Promise<{ success: true; result: AcceptSummary; isReplay: boolean } | { success: false; error: AcceptAllError }> {
	const { clientRequestId } = input;

	// Verify batch exists and user owns it
	const batchOwnership = await requireBatchOwned(db, userId, batchId);
	if (!batchOwnership.ok) {
		return { success: false, error: { type: batchOwnership.error } };
	}

	// Check idempotency key
	const requestHash = await sha256Hex(`batch:${batchId}`);
	const idempotencyCheck = await checkIdempotencyKey(db, userId, ACCEPT_ALL_SCOPE, clientRequestId, requestHash);

	if (idempotencyCheck.status === 'replay') {
		const cachedSummary = decodeJsonResultRef<AcceptSummary>('accept_summary', idempotencyCheck.resultRef);
		if (!cachedSummary) {
			return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
		}

		return { success: true, result: cachedSummary, isReplay: true };
	}

	if (idempotencyCheck.status === 'conflict') {
		// Try to extract original batch ID from stored result
		const existingKey = await findIdempotencyKey(db, userId, ACCEPT_ALL_SCOPE, clientRequestId);

		let originalBatchId = 'unknown';
		if (existingKey) {
			const storedSummary = decodeJsonResultRef<AcceptSummary>('accept_summary', existingKey.resultRef);
			if (storedSummary) {
				originalBatchId = storedSummary.batchId;
			}
		}

		return { success: false, error: { type: 'idempotency_conflict', originalBatchId } };
	}

	// Load all candidates
	const allCandidates: CandidateRow[] = await db
		.select({
			id: candidate.id,
			position: candidate.position,
			term: candidate.term,
			normalizedTerm: candidate.normalizedTerm,
			chosenBucket: candidate.chosenBucket,
			chosenText: candidate.chosenText,
			suggestedBucket: candidate.suggestedBucket,
			suggestedText: candidate.suggestedText,
			suggestionStatus: candidate.suggestionStatus,
			materializedTermId: candidate.materializedTermId,
			materializedTermSenseId: candidate.materializedTermSenseId,
		})
		.from(candidate)
		.where(eq(candidate.batchId, batchId))
		.orderBy(asc(candidate.position));

	const preparedCandidates = prepareCandidatesForAccept(allCandidates);
	if (!preparedCandidates.ok) {
		return { success: false, error: preparedCandidates.error };
	}

	// Phase 1: Build canonical → termId mapping

	// Filter unmaterialized candidates
	const { unmaterializedCandidates, candidateCount, skippedAlreadyAcceptedCount } = preparedCandidates;

	// Count already materialized

	// Get unique canonicals from unmaterialized candidates
	const uniqueCanonicals = [...new Set(unmaterializedCandidates.map((c) => normalize(c.term)))];

	// Pre-fetch existing terms for this user
	type ExistingTermRow = {
		id: string;
		canonical: string;
		primarySenseId: string | null;
	};
	let existingTerms: ExistingTermRow[] = [];
	if (uniqueCanonicals.length > 0) {
		existingTerms = await db
			.select({
				id: term.id,
				canonical: term.canonical,
				primarySenseId: term.primarySenseId,
			})
			.from(term)
			.where(
				and(
					eq(term.userId, userId),
					sql`${term.canonical} IN (${sql.join(
						uniqueCanonicals.map((c) => sql`${c}`),
						sql`, `
					)})`
				)
			);
	}

	// Build map of existing terms: canonical → { termId, primarySenseId }
	const existingTermMap = new Map<string, { termId: string; primarySenseId: string | null }>();
	for (const t of existingTerms) {
		existingTermMap.set(t.canonical, {
			termId: t.id,
			primarySenseId: t.primarySenseId,
		});
	}

	// Pre-fetch primary sense buckets for existing terms with primary senses
	const primarySenseIds = existingTerms.map((t) => t.primarySenseId).filter((id): id is string => id !== null);

	type PrimarySenseRow = { id: string; bucket: string };
	let primarySenses: PrimarySenseRow[] = [];
	if (primarySenseIds.length > 0) {
		primarySenses = await db
			.select({
				id: termSense.id,
				bucket: termSense.bucket,
			})
			.from(termSense)
			.where(
				sql`${termSense.id} IN (${sql.join(
					primarySenseIds.map((id) => sql`${id}`),
					sql`, `
				)})`
			);
	}

	// Build map of primary sense buckets
	const primarySenseBucketMap = new Map<string, string>();
	for (const ps of primarySenses) {
		primarySenseBucketMap.set(ps.id, ps.bucket);
	}

	// Pre-fetch bucket IDs for all unique effective buckets
	const uniqueBuckets = [...new Set(unmaterializedCandidates.map((c) => c.effectiveBucket).filter((b): b is string => b !== null))];
	type BucketIdRow = { slug: string; id: string };
	let bucketIdRows: BucketIdRow[] = [];
	if (uniqueBuckets.length > 0) {
		bucketIdRows = await db
			.select({ slug: bucket.slug, id: bucket.id })
			.from(bucket)
			.where(
				and(
					eq(bucket.userId, userId),
					sql`${bucket.slug} IN (${sql.join(
						uniqueBuckets.map((slug) => sql`${slug}`),
						sql`, `
					)})`
				)
			);
	}
	const bucketSlugToIdMap = new Map<string, string>();
	for (const b of bucketIdRows) {
		bucketSlugToIdMap.set(b.slug, b.id);
	}

	// Build canonical → termId map (including new terms to create)
	// Also track which candidates are "term creators"
	const canonicalToTermId = new Map<string, string>();
	const termCreatorCandidateIds = new Set<string>();

	for (const cand of unmaterializedCandidates) {
		const canonical = normalize(cand.term);

		if (!canonicalToTermId.has(canonical)) {
			const existing = existingTermMap.get(canonical);
			if (existing) {
				// Term already exists
				canonicalToTermId.set(canonical, existing.termId);
			} else {
				// New term - use deterministic ID from first candidate
				const newTermId = `term:${cand.id}`;
				canonicalToTermId.set(canonical, newTermId);
				termCreatorCandidateIds.add(cand.id);
			}
		}
	}

	// Phase 2: Generate D1 batch statements
	const now = new Date();
	const statements: D1PreparedStatement[] = [];

	// Counters for summary
	let termCreatedCount = 0;
	let termSenseCreatedCount = 0;
	let flaggedCount = 0;

	for (const cand of unmaterializedCandidates) {
		const canonical = normalize(cand.term);
		const termId = canonicalToTermId.get(canonical);
		if (!termId) throw new Error(`Internal error: missing termId for canonical "${canonical}"`);
		const termSenseId = `term_sense:${cand.id}`;

		// Effective fields (already validated non-null)
		const effectiveBucket = cand.effectiveBucket;
		const effectiveText = cand.effectiveText;
		if (!effectiveBucket || !effectiveText) {
			throw new Error(`Internal error: missing effective fields for candidate ${cand.id}`);
		}

		// Determine if this candidate creates a new term
		if (termCreatorCandidateIds.has(cand.id)) {
			// INSERT OR IGNORE INTO term
			const termStmt = db
				.insert(term)
				.values({
					id: termId,
					userId,
					canonical,
					displayTerm: cand.term,
					primarySenseId: termSenseId,
					createdAt: now,
				})
				.onConflictDoNothing()
				.toSQL();

			statements.push(rawDb.prepare(termStmt.sql).bind(...termStmt.params));
			termCreatedCount++;
		}

		// Determine flagged_reason
		let flaggedReason: string | null = null;
		const existingTermInfo = existingTermMap.get(canonical);
		if (existingTermInfo?.primarySenseId) {
			const primaryBucket = primarySenseBucketMap.get(existingTermInfo.primarySenseId);
			if (primaryBucket && primaryBucket !== effectiveBucket) {
				flaggedReason = 'bucket_conflict';
				flaggedCount++;
			}
		}

		// INSERT OR IGNORE INTO term_sense
		const effectiveBucketId = bucketSlugToIdMap.get(effectiveBucket) ?? null;
		const senseStmt = db
			.insert(termSense)
			.values({
				id: termSenseId,
				termId,
				bucket: effectiveBucket,
				bucketId: effectiveBucketId,
				text: effectiveText,
				source: 'batch' as TermSenseSource,
				flaggedReason,
				createdAt: now,
			})
			.onConflictDoNothing()
			.toSQL();

		statements.push(rawDb.prepare(senseStmt.sql).bind(...senseStmt.params));
		termSenseCreatedCount++;

		// UPDATE candidate with materialization pointers
		const candStmt = db
			.update(candidate)
			.set({
				status: 'accepted' as BatchStatus,
				materializedTermId: termId,
				materializedTermSenseId: termSenseId,
				updatedAt: now,
			})
			.where(eq(candidate.id, cand.id))
			.toSQL();

		statements.push(rawDb.prepare(candStmt.sql).bind(...candStmt.params));
	}

	// Update batch status
	const batchStmt = db
		.update(batch)
		.set({
			status: 'accepted' as BatchStatus,
			updatedAt: now,
		})
		.where(eq(batch.id, batchId))
		.toSQL();

	statements.push(rawDb.prepare(batchStmt.sql).bind(...batchStmt.params));

	// Build summary for idempotency storage
	const summary: AcceptSummary = {
		batchId,
		status: 'accepted',
		candidateCount,
		acceptedCount: termSenseCreatedCount,
		skippedAlreadyAcceptedCount,
		termCreatedCount,
		termSenseCreatedCount,
		flaggedCount,
	};

	// Insert idempotency key
	const resultRef = encodeJsonResultRef('accept_summary', summary);
	const idempStmt = createIdempotencyKeyStatement(db, userId, ACCEPT_ALL_SCOPE, clientRequestId, requestHash, resultRef, {
		createdAt: now,
	}).toSQL();

	statements.push(rawDb.prepare(idempStmt.sql).bind(...idempStmt.params));

	// Phase 3: Execute all statements atomically
	try {
		await rawDb.batch(statements);
	} catch (error) {
		// Handle race condition on idempotency key
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			// Re-check idempotency key
			const racedKey = await findIdempotencyKey(db, userId, ACCEPT_ALL_SCOPE, clientRequestId);

			if (racedKey) {
				if (racedKey.requestHash === requestHash) {
					// Replay
					const cachedSummary = decodeJsonResultRef<AcceptSummary>('accept_summary', racedKey.resultRef);
					if (cachedSummary) {
						return { success: true, result: cachedSummary, isReplay: true };
					}
				} else {
					// Conflict
					let originalBatchId = 'unknown';
					const storedSummary = decodeJsonResultRef<AcceptSummary>('accept_summary', racedKey.resultRef);
					if (storedSummary) {
						originalBatchId = storedSummary.batchId;
					}
					return { success: false, error: { type: 'idempotency_conflict', originalBatchId } };
				}
			}
		}

		console.error('Accept-all error:', error);
		return { success: false, error: { type: 'internal_error', message: 'Failed to accept batch' } };
	}

	return { success: true, result: summary, isReplay: false };
}

function prepareCandidatesForAccept(candidates: CandidateRow[]):
	| {
			ok: true;
			unmaterializedCandidates: CandidateWithEffective[];
			candidateCount: number;
			skippedAlreadyAcceptedCount: number;
	  }
	| { ok: false; error: AcceptAllError } {
	const candidateCount = candidates.length;

	// Precondition: check for in-progress suggestions
	const inProgressIds = candidates.filter((c) => c.suggestionStatus === 'in_progress').map((c) => c.id);
	if (inProgressIds.length > 0) {
		return { ok: false, error: { type: 'suggestions_in_progress', candidateIds: inProgressIds } };
	}

	// Compute effective fields and check for missing
	const candidatesWithEffective: CandidateWithEffective[] = candidates.map((cand) => ({
		...cand,
		effectiveBucket: cand.chosenBucket ?? cand.suggestedBucket,
		effectiveText: cand.chosenText ?? cand.suggestedText,
	}));

	const missingIds = candidatesWithEffective.filter((c) => c.effectiveBucket === null || c.effectiveText === null).map((c) => c.id);
	if (missingIds.length > 0) {
		return { ok: false, error: { type: 'missing_effective_fields', candidateIds: missingIds } };
	}

	// Filter unmaterialized candidates
	const unmaterializedCandidates = candidatesWithEffective.filter((c) => c.materializedTermSenseId === null);
	const skippedAlreadyAcceptedCount = candidateCount - unmaterializedCandidates.length;

	return { ok: true, unmaterializedCandidates, candidateCount, skippedAlreadyAcceptedCount };
}
