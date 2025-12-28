/**
 * Use case: Generate suggestions for a batch's candidates with SSE streaming.
 *
 * Streams progress events to the client as candidates are processed.
 */

import type { Bucket } from '@append/contracts/types';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type BatchStatus, batch, candidate, type SuggestionStatus, type schema } from '../../../db';
import { sseEvent } from '../../../platform/sse';
import { PROMPT_VERSION, SUGGESTION_MODEL } from '../adapters/llm.aigateway';
import { cacheSuggestion, findCachedSuggestion } from '../data/suggestion-cache';
import type { LlmClient, Suggestion } from '../ports/llm';
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
	suggestedBucket: Bucket | null;
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
 * @param emit - Function to emit SSE events
 */
export async function* generateSuggestions(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	batchId: string,
	llm: LlmClient,
	mode: SuggestionMode,
	limit: number
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

	// Track terms we've already processed in this run (for within-batch cache hits)
	const processedTerms = new Map<string, Suggestion>();

	// Process candidates sequentially
	for (const cand of candidatesToProcess) {
		const event = await processCandidate(db, userId, batchId, cand, llm, isRegenerate, processedTerms, results);
		yield sseEvent('candidate', event);
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
	isRegenerate: boolean,
	processedTerms: Map<string, Suggestion>,
	results: { ok: number; failed: number; cached: number; skippedAlreadySuggested: number; errors: number }
): Promise<SuggestCandidateEvent> {
	const now = new Date();

	// Check if we already processed this term in this batch run
	const inBatchCached = processedTerms.get(cand.normalizedTerm);
	if (inBatchCached && !isRegenerate) {
		// Use cached result from this batch run
		await db
			.update(candidate)
			.set({
				suggestedBucket: inBatchCached.bucket,
				suggestedText: inBatchCached.text,
				suggestionStatus: 'done' as SuggestionStatus,
				suggestionError: null,
				suggestionUpdatedAt: now,
				status: 'suggested' as BatchStatus,
				updatedAt: now,
			})
			.where(eq(candidate.id, cand.id));

		results.cached++;
		return { id: cand.id, term: cand.term, status: 'cached', suggestion: inBatchCached };
	}

	// Check D1 cache (fill-missing mode only)
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

			// Add to in-batch cache
			processedTerms.set(cand.normalizedTerm, cachedSuggestion);

			results.cached++;
			return { id: cand.id, term: cand.term, status: 'cached', suggestion: cachedSuggestion };
		}
	}

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
		// Failed to claim - someone else is processing or max attempts reached
		// Don't count this in results as it's a race condition edge case
		return { id: cand.id, term: cand.term, status: 'skipped' };
	}

	// Generate suggestion using LLM
	try {
		const suggestion = await llm.suggestOne(cand.term);

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

		// Add to in-batch cache
		processedTerms.set(cand.normalizedTerm, suggestion);

		// Save to D1 cache (fill-missing mode only)
		if (!isRegenerate) {
			await cacheSuggestion(db, userId, cand.normalizedTerm, SUGGESTION_MODEL, PROMPT_VERSION, suggestion);
		}

		results.ok++;
		return { id: cand.id, term: cand.term, status: 'ok', suggestion };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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

		results.failed++;
		return { id: cand.id, term: cand.term, status: 'error', error: errorMessage };
	}
}
