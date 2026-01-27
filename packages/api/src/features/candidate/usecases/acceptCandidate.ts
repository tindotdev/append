/**
 * Use case: Accept a single candidate and materialize to term/sense.
 *
 * Implements idempotent single-candidate accept with materialization.
 * Follows the same pattern as acceptAll but for individual candidates.
 */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type BatchStatus, candidate, normalize, type schema, type TermSenseSource, term, termSense } from '../../../db';
import { sha256Hex } from '../../../shared/crypto';
import { checkIdempotencyKey, createIdempotencyKeyStatement, findIdempotencyKey } from '../../../shared/idempotency/keys';
import { decodeJsonResultRef, encodeJsonResultRef } from '../../../shared/idempotency/result-ref';
import { requireCandidateOwned } from '../../../shared/queries';
import type { AcceptCandidateInput, AcceptCandidateResult } from '../validation/acceptCandidate.schema';

/**
 * Idempotency scope for accept candidate.
 */
const ACCEPT_CANDIDATE_SCOPE = 'accept_candidate' as const;

/**
 * Error types for accept candidate.
 */
export type AcceptCandidateError =
	| { type: 'not_found' }
	| { type: 'forbidden' }
	| { type: 'already_accepted' }
	| { type: 'suggestion_in_progress' }
	| { type: 'missing_effective_fields' }
	| { type: 'version_conflict'; currentVersion: number }
	| { type: 'idempotency_conflict'; originalCandidateId: string }
	| { type: 'internal_error'; message: string };

/**
 * Accept a single candidate.
 *
 * @param db - Drizzle D1 database instance
 * @param rawDb - Raw D1 database for batch operations
 * @param userId - User ID
 * @param candidateId - Candidate ID
 * @param input - Validated input with clientRequestId and expectedVersion
 * @returns Accept result or error
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates single candidate accept with conflict detection
export async function acceptCandidate(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	candidateId: string,
	input: AcceptCandidateInput
): Promise<{ success: true; result: AcceptCandidateResult; isReplay: boolean } | { success: false; error: AcceptCandidateError }> {
	const { clientRequestId, expectedVersion } = input;

	// Check idempotency key first (before ownership check for efficiency)
	const requestHash = await sha256Hex(`candidate:${candidateId}`);
	const idempotencyCheck = await checkIdempotencyKey(db, userId, ACCEPT_CANDIDATE_SCOPE, clientRequestId, requestHash);

	if (idempotencyCheck.status === 'replay') {
		const cachedResult = decodeJsonResultRef<AcceptCandidateResult>('accept_candidate_result', idempotencyCheck.resultRef);
		if (!cachedResult) {
			return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
		}
		return { success: true, result: cachedResult, isReplay: true };
	}

	if (idempotencyCheck.status === 'conflict') {
		const existingKey = await findIdempotencyKey(db, userId, ACCEPT_CANDIDATE_SCOPE, clientRequestId);
		let originalCandidateId = 'unknown';
		if (existingKey) {
			const storedResult = decodeJsonResultRef<AcceptCandidateResult>('accept_candidate_result', existingKey.resultRef);
			if (storedResult) {
				originalCandidateId = storedResult.candidate.id;
			}
		}
		return { success: false, error: { type: 'idempotency_conflict', originalCandidateId } };
	}

	// Verify candidate exists and user owns it (via batch ownership)
	const candidateOwnership = await requireCandidateOwned(db, userId, candidateId);
	if (!candidateOwnership.ok) {
		return { success: false, error: { type: candidateOwnership.error } };
	}

	const candidateRow = candidateOwnership.candidate;

	// Check version for optimistic locking
	if (candidateRow.version !== expectedVersion) {
		return { success: false, error: { type: 'version_conflict', currentVersion: candidateRow.version } };
	}

	// Check if already accepted
	if (candidateRow.materializedTermSenseId !== null) {
		return { success: false, error: { type: 'already_accepted' } };
	}

	// Check if suggestion is in progress
	if (candidateRow.suggestionStatus === 'in_progress') {
		return { success: false, error: { type: 'suggestion_in_progress' } };
	}

	// Compute effective fields
	const effectiveBucket = candidateRow.chosenBucket ?? candidateRow.suggestedBucket;
	const effectiveText = candidateRow.chosenText ?? candidateRow.suggestedText;

	if (!effectiveBucket || !effectiveText) {
		return { success: false, error: { type: 'missing_effective_fields' } };
	}

	// Check if term already exists for this canonical form
	const canonical = normalize(candidateRow.term);

	type ExistingTermRow = {
		id: string;
		primarySenseId: string | null;
	};

	const existingTerms: ExistingTermRow[] = await db
		.select({
			id: term.id,
			primarySenseId: term.primarySenseId,
		})
		.from(term)
		.where(and(eq(term.userId, userId), eq(term.canonical, canonical)));

	const existingTerm = existingTerms[0] ?? null;

	// Determine termId
	let termId: string;
	let isNewTerm: boolean;

	if (existingTerm) {
		termId = existingTerm.id;
		isNewTerm = false;
	} else {
		termId = `term:${candidateId}`;
		isNewTerm = true;
	}

	const termSenseId = `term_sense:${candidateId}`;

	// Check for bucket conflict if term exists
	let flaggedReason: string | null = null;
	if (existingTerm?.primarySenseId) {
		const primarySenses = await db.select({ bucket: termSense.bucket }).from(termSense).where(eq(termSense.id, existingTerm.primarySenseId));

		const primarySense = primarySenses[0];
		if (primarySense && primarySense.bucket !== effectiveBucket) {
			flaggedReason = 'bucket_conflict';
		}
	}

	// Build D1 batch statements
	const now = new Date();
	const statements: D1PreparedStatement[] = [];

	// Create term if new
	if (isNewTerm) {
		const termStmt = db
			.insert(term)
			.values({
				id: termId,
				userId,
				canonical,
				displayTerm: candidateRow.term,
				primarySenseId: termSenseId,
				createdAt: now,
			})
			.onConflictDoNothing()
			.toSQL();

		statements.push(rawDb.prepare(termStmt.sql).bind(...termStmt.params));
	}

	// Create term sense
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

	// Update candidate with materialization pointers
	const newVersion = candidateRow.version + 1;
	const candStmt = db
		.update(candidate)
		.set({
			status: 'accepted' as BatchStatus,
			materializedTermId: termId,
			materializedTermSenseId: termSenseId,
			version: newVersion,
			updatedAt: now,
		})
		.where(eq(candidate.id, candidateId))
		.toSQL();

	statements.push(rawDb.prepare(candStmt.sql).bind(...candStmt.params));

	// Build result for idempotency storage
	const acceptResult: AcceptCandidateResult = {
		candidate: {
			id: candidateId,
			status: 'accepted',
			materializedTermId: termId,
			materializedTermSenseId: termSenseId,
			version: newVersion,
		},
		termId,
		termSenseId,
		isNewTerm,
		flaggedReason,
	};

	// Insert idempotency key
	const resultRef = encodeJsonResultRef('accept_candidate_result', acceptResult);
	const idempStmt = createIdempotencyKeyStatement(db, userId, ACCEPT_CANDIDATE_SCOPE, clientRequestId, requestHash, resultRef, {
		createdAt: now,
	}).toSQL();

	statements.push(rawDb.prepare(idempStmt.sql).bind(...idempStmt.params));

	// Execute all statements atomically
	try {
		await rawDb.batch(statements);
	} catch (error) {
		// Handle race condition on idempotency key
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			const racedKey = await findIdempotencyKey(db, userId, ACCEPT_CANDIDATE_SCOPE, clientRequestId);

			if (racedKey) {
				if (racedKey.requestHash === requestHash) {
					// Replay
					const cachedResult = decodeJsonResultRef<AcceptCandidateResult>('accept_candidate_result', racedKey.resultRef);
					if (cachedResult) {
						return { success: true, result: cachedResult, isReplay: true };
					}
				} else {
					// Conflict
					let originalCandidateId = 'unknown';
					const storedResult = decodeJsonResultRef<AcceptCandidateResult>('accept_candidate_result', racedKey.resultRef);
					if (storedResult) {
						originalCandidateId = storedResult.candidate.id;
					}
					return { success: false, error: { type: 'idempotency_conflict', originalCandidateId } };
				}
			}
		}

		console.error('Accept-candidate error:', error);
		return { success: false, error: { type: 'internal_error', message: 'Failed to accept candidate' } };
	}

	return { success: true, result: acceptResult, isReplay: false };
}
