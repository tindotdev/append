/**
 * Use case: Accept all candidates in a batch and materialize to terms/senses.
 *
 * Implements idempotent accept with materialization pointers per ADR 0008.
 */

import { and, eq, asc, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { Bucket } from '@append/contracts/types';
import {
	batch,
	candidate,
	term,
	termSense,
	idempotencyKey,
	normalize,
	type BatchStatus,
	type SuggestionStatus,
	type TermSenseSource,
	type schema,
} from '../../../db';
import { sha256Hex } from '../../../shared/crypto';
import { checkIdempotencyKey } from '../../../shared/idempotency/keys';
import { toBase64Url, fromBase64Url } from '../../../shared/idempotency/encoding';
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
export async function acceptAll(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	batchId: string,
	input: AcceptAllInput
): Promise<{ success: true; result: AcceptSummary; isReplay: boolean } | { success: false; error: AcceptAllError }> {
	const { clientRequestId } = input;

	// Verify batch exists and user owns it
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
	});

	if (!batchRow) {
		return { success: false, error: { type: 'not_found' } };
	}

	if (batchRow.userId !== userId) {
		return { success: false, error: { type: 'forbidden' } };
	}

	// Check idempotency key
	const requestHash = await sha256Hex(`batch:${batchId}`);
	const idempotencyCheck = await checkIdempotencyKey(db, userId, ACCEPT_ALL_SCOPE, clientRequestId, requestHash);

	if (idempotencyCheck.status === 'replay') {
		// Extract and decode cached summary
		const resultRefMatch = idempotencyCheck.resultRef.match(/^accept_summary:(.+)$/);
		if (!resultRefMatch) {
			return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
		}

		try {
			const summaryJson = fromBase64Url(resultRefMatch[1]);
			const cachedSummary = JSON.parse(summaryJson) as AcceptSummary;
			return { success: true, result: cachedSummary, isReplay: true };
		} catch {
			return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
		}
	}

	if (idempotencyCheck.status === 'conflict') {
		// Try to extract original batch ID from stored result
		const existingKey = await db.query.idempotencyKey.findFirst({
			where: and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.scope, ACCEPT_ALL_SCOPE), eq(idempotencyKey.key, clientRequestId)),
		});

		let originalBatchId = 'unknown';
		if (existingKey) {
			const resultRefMatch = existingKey.resultRef.match(/^accept_summary:(.+)$/);
			if (resultRefMatch) {
				try {
					const summaryJson = fromBase64Url(resultRefMatch[1]);
					const storedSummary = JSON.parse(summaryJson) as AcceptSummary;
					originalBatchId = storedSummary.batchId;
				} catch {
					// Keep 'unknown'
				}
			}
		}

		return { success: false, error: { type: 'idempotency_conflict', originalBatchId } };
	}

	// Load all candidates
	const allCandidates = await db
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

	const candidateCount = allCandidates.length;

	// Precondition: check for in-progress suggestions
	const inProgressIds = allCandidates.filter((c) => c.suggestionStatus === 'in_progress').map((c) => c.id);

	if (inProgressIds.length > 0) {
		return { success: false, error: { type: 'suggestions_in_progress', candidateIds: inProgressIds } };
	}

	// Compute effective fields and check for missing
	type CandidateWithEffective = (typeof allCandidates)[number] & {
		effectiveBucket: Bucket | null;
		effectiveText: string | null;
	};

	const candidatesWithEffective: CandidateWithEffective[] = allCandidates.map((cand) => ({
		...cand,
		effectiveBucket: cand.chosenBucket ?? cand.suggestedBucket,
		effectiveText: cand.chosenText ?? cand.suggestedText,
	}));

	const missingIds = candidatesWithEffective.filter((c) => c.effectiveBucket === null || c.effectiveText === null).map((c) => c.id);

	if (missingIds.length > 0) {
		return { success: false, error: { type: 'missing_effective_fields', candidateIds: missingIds } };
	}

	// Phase 1: Build canonical → termId mapping

	// Filter unmaterialized candidates
	const unmaterializedCandidates = candidatesWithEffective.filter((c) => c.materializedTermSenseId === null);

	// Count already materialized
	const skippedAlreadyAcceptedCount = candidateCount - unmaterializedCandidates.length;

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

	type PrimarySenseRow = { id: string; bucket: Bucket };
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
	const primarySenseBucketMap = new Map<string, Bucket>();
	for (const ps of primarySenses) {
		primarySenseBucketMap.set(ps.id, ps.bucket);
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
		const termId = canonicalToTermId.get(canonical)!;
		const termSenseId = `term_sense:${cand.id}`;

		// Effective fields (already validated non-null)
		const effectiveBucket = cand.effectiveBucket!;
		const effectiveText = cand.effectiveText!;

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
		const senseStmt = db
			.insert(termSense)
			.values({
				id: termSenseId,
				termId,
				bucket: effectiveBucket,
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
	const resultRef = `accept_summary:${toBase64Url(JSON.stringify(summary))}`;
	const idempStmt = db
		.insert(idempotencyKey)
		.values({
			userId,
			scope: ACCEPT_ALL_SCOPE,
			key: clientRequestId,
			requestHash,
			resultRef,
			createdAt: now,
		})
		.toSQL();

	statements.push(rawDb.prepare(idempStmt.sql).bind(...idempStmt.params));

	// Phase 3: Execute all statements atomically
	try {
		await rawDb.batch(statements);
	} catch (error) {
		// Handle race condition on idempotency key
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			// Re-check idempotency key
			const racedKey = await db.query.idempotencyKey.findFirst({
				where: and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.scope, ACCEPT_ALL_SCOPE), eq(idempotencyKey.key, clientRequestId)),
			});

			if (racedKey) {
				if (racedKey.requestHash === requestHash) {
					// Replay
					const resultRefMatch = racedKey.resultRef.match(/^accept_summary:(.+)$/);
					if (resultRefMatch) {
						try {
							const summaryJson = fromBase64Url(resultRefMatch[1]);
							const cachedSummary = JSON.parse(summaryJson) as AcceptSummary;
							return { success: true, result: cachedSummary, isReplay: true };
						} catch {
							// Fall through to error
						}
					}
				} else {
					// Conflict
					const resultRefMatch = racedKey.resultRef.match(/^accept_summary:(.+)$/);
					let originalBatchId = 'unknown';
					if (resultRefMatch) {
						try {
							const summaryJson = fromBase64Url(resultRefMatch[1]);
							const storedSummary = JSON.parse(summaryJson) as AcceptSummary;
							originalBatchId = storedSummary.batchId;
						} catch {
							// Fall through
						}
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
