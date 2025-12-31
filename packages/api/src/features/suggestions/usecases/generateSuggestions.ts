/**
 * Use case: Generate suggestions for a batch's candidates with SSE streaming.
 *
 * Streams progress events to the client as candidates are processed.
 */

import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type BatchStatus, batch, candidate, type SuggestionStatus, type schema } from '../../../db';
import { DEFAULT_CONCURRENCY, parallelStream } from '../../../platform/parallel';
import { sseEvent } from '../../../platform/sse';
import { PROMPT_VERSION, SUGGESTION_MODEL } from '../adapters/llm.aigateway';
import { cacheSuggestion, findCachedSuggestion } from '../data/suggestion-cache';
import type { BucketInfo, LlmClient, Suggestion } from '../ports/llm';
import { MAX_SUGGESTION_ATTEMPTS, type SuggestionMode } from '../validation/suggest.schema';

/**
 * SSE event types for suggestion progress.
 */
export interface SuggestStartEvent {
	batchId: string;
	mode: SuggestionMode;
	candidateCount: number;
	eligibleCount: number;
	limit: number;
}

export interface SuggestCandidateEvent {
	id: string;
	term: string;
	status: 'running' | 'ok' | 'cached' | 'error' | 'skipped';
	suggestion?: Suggestion;
	error?: string;
}

export interface SuggestDoneEvent {
	ok: number;
	failed: number;
	cached: number;
	skippedAlreadySuggested: number;
	errors: number;
}

/**
 * Candidate record for processing.
 */
interface CandidateRecord {
	id: string;
	normalizedTerm: string;
	term: string;
	position: number;
	suggestedBucket: string | null;
	suggestedText: string | null;
	suggestionStatus: SuggestionStatus | null;
	suggestionAttempts: number;
}

/**
 * Generate suggestions for a batch with SSE streaming.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID
 * @param batchId - Batch ID
 * @param llm - LLM client for generating suggestions
 * @param mode - 'fill-missing' or 'regenerate'
 * @param limit - Maximum candidates to process
 * @param buckets - User's buckets for dynamic prompt
 */
export async function* generateSuggestions(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	batchId: string,
	llm: LlmClient,
	mode: SuggestionMode,
	limit: number,
	buckets: BucketInfo[]
): AsyncGenerator<string, void, unknown> {
	const isRegenerate = mode === 'regenerate';

	// Get all candidates for this batch
	const allCandidates = await db
		.select({
			id: candidate.id,
			normalizedTerm: candidate.normalizedTerm,
			term: candidate.term,
			position: candidate.position,
			suggestedBucket: candidate.suggestedBucket,
			suggestedText: candidate.suggestedText,
			suggestionStatus: candidate.suggestionStatus,
			suggestionAttempts: candidate.suggestionAttempts,
		})
		.from(candidate)
		.where(eq(candidate.batchId, batchId))
		.orderBy(asc(candidate.position));

	// Count already suggested for fill-missing mode
	let skippedAlreadySuggested = 0;

	// Determine eligible candidates based on mode
	const eligibleCandidates = allCandidates.filter((cand) => {
		// Never process candidates at max attempts
		if (cand.suggestionAttempts >= MAX_SUGGESTION_ATTEMPTS) {
			return false;
		}

		if (isRegenerate) {
			// Regenerate mode: all candidates with attempts < 3
			return true;
		}

		// Fill-missing mode:
		// - Skip already suggested (has both bucket and text)
		// - Skip in_progress
		// - Include null/error status for retry
		if (cand.suggestedBucket !== null && cand.suggestedText !== null) {
			skippedAlreadySuggested++;
			return false;
		}
		if (cand.suggestionStatus === 'in_progress') {
			return false;
		}
		return true;
	});

	// Apply limit
	const candidatesToProcess = eligibleCandidates.slice(0, limit);

	// Emit start event with all the stats
	yield sseEvent('start', {
		batchId,
		mode,
		candidateCount: allCandidates.length,
		eligibleCount: candidatesToProcess.length,
		limit,
	} satisfies SuggestStartEvent);

	// Track results
	const results = {
		ok: 0,
		failed: 0,
		cached: 0,
		skippedAlreadySuggested,
		errors: 0,
	};

	// Track in-flight LLM calls by term to prevent duplicate work
	// When processing in parallel, if two candidates have the same term, the first one
	// will create a Promise that the second one can await.
	const inFlightTerms = new Map<string, Promise<Suggestion>>();

	// Process candidates in parallel with concurrency limit (ADR 0011)
	for await (const result of parallelStream(
		candidatesToProcess,
		(cand) => processCandidate(db, userId, batchId, cand, llm, buckets, isRegenerate, inFlightTerms, results),
		DEFAULT_CONCURRENCY
	)) {
		// parallelStream yields PromiseSettledResult, but processCandidate handles its own errors
		// so we always get fulfilled results with the event inside
		if (result.status === 'fulfilled') {
			yield sseEvent('candidate', result.value);
		}
	}

	// Update batch status to 'suggested'
	await db
		.update(batch)
		.set({ status: 'suggested' as BatchStatus, updatedAt: new Date() })
		.where(eq(batch.id, batchId));

	// Update errors from failed count
	results.errors = results.failed;

	// Emit done event
	yield sseEvent('done', results satisfies SuggestDoneEvent);
}

/**
 * Process a single candidate for suggestion generation.
 */
async function processCandidate(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	_batchId: string,
	cand: CandidateRecord,
	llm: LlmClient,
	buckets: BucketInfo[],
	isRegenerate: boolean,
	inFlightTerms: Map<string, Promise<Suggestion>>,
	results: { ok: number; failed: number; cached: number; skippedAlreadySuggested: number; errors: number }
): Promise<SuggestCandidateEvent> {
	const now = new Date();

	// Check D1 cache first (fill-missing mode only)
	if (!isRegenerate) {
		const cachedSuggestion = await findCachedSuggestion(db, userId, cand.normalizedTerm, SUGGESTION_MODEL, PROMPT_VERSION);

		if (cachedSuggestion) {
			// Use cached result
			await db
				.update(candidate)
				.set({
					suggestedBucket: cachedSuggestion.bucket,
					suggestedText: cachedSuggestion.text,
					suggestionStatus: 'done' as SuggestionStatus,
					suggestionError: null,
					suggestionUpdatedAt: now,
					status: 'suggested' as BatchStatus,
					updatedAt: now,
				})
				.where(eq(candidate.id, cand.id));

			results.cached++;
			return { id: cand.id, term: cand.term, status: 'cached', suggestion: cachedSuggestion };
		}
	}

	// Atomically check-and-register for in-flight deduplication (fill-missing mode only)
	// If another candidate with the same term is already being processed, wait for its result
	let llmPromise: Promise<Suggestion>;
	let isLeader = false;

	if (!isRegenerate) {
		const existingPromise = inFlightTerms.get(cand.normalizedTerm);
		if (existingPromise) {
			// Another candidate is already processing this term - wait for it
			llmPromise = existingPromise;
		} else {
			// We're the first - create the promise and register it
			isLeader = true;
			llmPromise = (async () => {
				// Claim the candidate with conditional update
				const claimResult = await db
					.update(candidate)
					.set({
						suggestionStatus: 'in_progress' as SuggestionStatus,
						suggestionAttempts: sql`${candidate.suggestionAttempts} + 1`,
						suggestionUpdatedAt: now,
						updatedAt: now,
					})
					.where(
						and(
							eq(candidate.id, cand.id),
							or(isNull(candidate.suggestionStatus), eq(candidate.suggestionStatus, 'done'), eq(candidate.suggestionStatus, 'error')),
							lt(candidate.suggestionAttempts, MAX_SUGGESTION_ATTEMPTS)
						)
					)
					.returning({ id: candidate.id });

				if (claimResult.length === 0) {
					// Failed to claim - this shouldn't happen for the leader
					throw new Error('Failed to claim candidate');
				}

				// Generate suggestion
				const suggestion = await llm.suggestOne(cand.term, buckets);

				// Update candidate with result
				await db
					.update(candidate)
					.set({
						suggestedBucket: suggestion.bucket,
						suggestedText: suggestion.text,
						suggestionStatus: 'done' as SuggestionStatus,
						suggestionError: null,
						suggestionUpdatedAt: new Date(),
						status: 'suggested' as BatchStatus,
						updatedAt: new Date(),
					})
					.where(eq(candidate.id, cand.id));

				// Save to D1 cache
				await cacheSuggestion(db, userId, cand.normalizedTerm, SUGGESTION_MODEL, PROMPT_VERSION, suggestion);

				return suggestion;
			})();

			// Register the promise immediately
			inFlightTerms.set(cand.normalizedTerm, llmPromise);
		}
	} else {
		// Regenerate mode - no deduplication, always generate fresh
		llmPromise = (async () => {
			// Claim the candidate
			const claimResult = await db
				.update(candidate)
				.set({
					suggestionStatus: 'in_progress' as SuggestionStatus,
					suggestionAttempts: sql`${candidate.suggestionAttempts} + 1`,
					suggestionUpdatedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(candidate.id, cand.id),
						or(isNull(candidate.suggestionStatus), eq(candidate.suggestionStatus, 'done'), eq(candidate.suggestionStatus, 'error')),
						lt(candidate.suggestionAttempts, MAX_SUGGESTION_ATTEMPTS)
					)
				)
				.returning({ id: candidate.id });

			if (claimResult.length === 0) {
				throw new Error('Failed to claim candidate');
			}

			// Generate suggestion
			const suggestion = await llm.suggestOne(cand.term, buckets);

			// Update candidate with result
			await db
				.update(candidate)
				.set({
					suggestedBucket: suggestion.bucket,
					suggestedText: suggestion.text,
					suggestionStatus: 'done' as SuggestionStatus,
					suggestionError: null,
					suggestionUpdatedAt: new Date(),
					status: 'suggested' as BatchStatus,
					updatedAt: new Date(),
				})
				.where(eq(candidate.id, cand.id));

			return suggestion;
		})();
		isLeader = true;
	}

	// Wait for the LLM call to complete
	try {
		const suggestion = await llmPromise;

		// If we're a follower (not the leader), update our candidate with the shared result
		if (!isLeader) {
			await db
				.update(candidate)
				.set({
					suggestedBucket: suggestion.bucket,
					suggestedText: suggestion.text,
					suggestionStatus: 'done' as SuggestionStatus,
					suggestionError: null,
					suggestionUpdatedAt: new Date(),
					status: 'suggested' as BatchStatus,
					updatedAt: new Date(),
				})
				.where(eq(candidate.id, cand.id));

			results.cached++;
			return { id: cand.id, term: cand.term, status: 'cached', suggestion };
		}

		// Leader case
		results.ok++;
		return { id: cand.id, term: cand.term, status: 'ok', suggestion };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		// If we're a follower and the leader failed, we need to mark ourselves as failed too
		if (!isLeader) {
			await db
				.update(candidate)
				.set({
					suggestionStatus: 'error' as SuggestionStatus,
					suggestionError: errorMessage,
					suggestionUpdatedAt: new Date(),
					status: 'suggested' as BatchStatus,
					updatedAt: new Date(),
				})
				.where(eq(candidate.id, cand.id));
		}

		results.failed++;
		return { id: cand.id, term: cand.term, status: 'error', error: errorMessage };
	}
}
