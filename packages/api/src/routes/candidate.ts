import { BUCKETS, type Bucket } from '@append/contracts/types';
import { safeParseBucket } from '@append/contracts/validators';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { batch, candidate, schema } from '../db';
import { apiError } from '../shared/api-error';

// =============================================================================
// Constants
// =============================================================================

const MAX_CHOSEN_TEXT_LENGTH = 500;

// =============================================================================
// Types
// =============================================================================

type Bindings = {
	DB: D1Database;
};

type Variables = {
	userId: string;
};

// =============================================================================
// Candidate routes
// =============================================================================

const candidateRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * PUT /api/candidate/:id - Update a candidate's chosen bucket/text (owner-only)
 *
 * Request: {
 *   expectedVersion: number (required),
 *   chosenBucket?: Bucket | null (optional key),
 *   chosenText?: string | null (optional key)
 * }
 *
 * Response 200: { candidate: <Candidate> }
 * Errors: 400, 401, 403, 404, 409
 */
candidateRoutes.put('/:id', async (c) => {
	const userId = c.get('userId');
	const candidateId = c.req.param('id');
	const db = drizzle(c.env.DB, { schema });

	// -------------------------------------------------------------------------
	// 1. Parse and validate request body
	// -------------------------------------------------------------------------
	let body: {
		expectedVersion?: unknown;
		chosenBucket?: unknown;
		chosenText?: unknown;
	};
	try {
		body = await c.req.json();
	} catch {
		return apiError(c, 400, 'INVALID_JSON', 'Invalid JSON in request body');
	}

	// Validate expectedVersion is present and is an integer
	if (body.expectedVersion === undefined) {
		return apiError(c, 400, 'VALIDATION_ERROR', 'expectedVersion is required');
	}
	if (typeof body.expectedVersion !== 'number' || !Number.isInteger(body.expectedVersion)) {
		return apiError(c, 400, 'VALIDATION_ERROR', 'expectedVersion must be an integer');
	}
	const expectedVersion = body.expectedVersion;

	// At least one of chosenBucket or chosenText must be present in the request
	const hasChosenBucket = 'chosenBucket' in body;
	const hasChosenText = 'chosenText' in body;

	if (!hasChosenBucket && !hasChosenText) {
		return apiError(c, 400, 'VALIDATION_ERROR', 'At least one of chosenBucket or chosenText must be provided');
	}

	// Validate chosenBucket if present
	let chosenBucket: Bucket | null | undefined;
	if (hasChosenBucket) {
		if (body.chosenBucket === null) {
			chosenBucket = null;
		} else if (typeof body.chosenBucket === 'string') {
			const parsedBucket = safeParseBucket(body.chosenBucket);
			if (!parsedBucket.success) {
				return apiError(c, 400, 'VALIDATION_ERROR', `chosenBucket must be one of: ${BUCKETS.join(', ')}`);
			}
			chosenBucket = parsedBucket.output;
		} else {
			return apiError(c, 400, 'VALIDATION_ERROR', 'chosenBucket must be a string or null');
		}
	}

	// Validate chosenText if present
	let chosenText: string | null | undefined;
	if (hasChosenText) {
		if (body.chosenText === null) {
			chosenText = null;
		} else if (typeof body.chosenText === 'string') {
			const trimmed = body.chosenText.trim();

			// Must be non-empty after trimming
			if (trimmed.length === 0) {
				return apiError(c, 400, 'VALIDATION_ERROR', 'chosenText cannot be empty');
			}

			// Must not contain newlines
			if (trimmed.includes('\n')) {
				return apiError(c, 400, 'VALIDATION_ERROR', 'chosenText must be a single line');
			}

			// Must not exceed max length
			if (trimmed.length > MAX_CHOSEN_TEXT_LENGTH) {
				return apiError(c, 400, 'VALIDATION_ERROR', `chosenText must not exceed ${MAX_CHOSEN_TEXT_LENGTH} characters`);
			}

			chosenText = trimmed;
		} else {
			return apiError(c, 400, 'VALIDATION_ERROR', 'chosenText must be a string or null');
		}
	}

	// -------------------------------------------------------------------------
	// 2. Lookup candidate and verify ownership
	// -------------------------------------------------------------------------
	const candidateRow = await db.query.candidate.findFirst({
		where: eq(candidate.id, candidateId),
	});

	if (!candidateRow) {
		return apiError(c, 404, 'NOT_FOUND', 'Candidate not found');
	}

	// Lookup batch to verify ownership
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, candidateRow.batchId),
	});

	if (!batchRow) {
		return apiError(c, 404, 'NOT_FOUND', 'Candidate not found');
	}

	if (batchRow.userId !== userId) {
		return apiError(c, 403, 'FORBIDDEN', 'Access denied');
	}

	// -------------------------------------------------------------------------
	// 3. Build update set (partial update semantics)
	// -------------------------------------------------------------------------
	const updateSet: Record<string, unknown> = {
		version: sql`${candidate.version} + 1`,
		updatedAt: new Date(),
	};

	if (chosenBucket !== undefined) {
		updateSet.chosenBucket = chosenBucket;
	}
	if (chosenText !== undefined) {
		updateSet.chosenText = chosenText;
	}

	// -------------------------------------------------------------------------
	// 4. Atomic conditional update with optimistic locking
	// -------------------------------------------------------------------------
	const updateResult = await db
		.update(candidate)
		.set(updateSet)
		.where(sql`${candidate.id} = ${candidateId} AND ${candidate.version} = ${expectedVersion}`)
		.returning({
			id: candidate.id,
			position: candidate.position,
			term: candidate.term,
			normalizedTerm: candidate.normalizedTerm,
			status: candidate.status,
			chosenBucket: candidate.chosenBucket,
			chosenText: candidate.chosenText,
			suggestedBucket: candidate.suggestedBucket,
			suggestedText: candidate.suggestedText,
			suggestionStatus: candidate.suggestionStatus,
			suggestionError: candidate.suggestionError,
			suggestionAttempts: candidate.suggestionAttempts,
			version: candidate.version,
			materializedTermId: candidate.materializedTermId,
			materializedTermSenseId: candidate.materializedTermSenseId,
			createdAt: candidate.createdAt,
			updatedAt: candidate.updatedAt,
		});

	// -------------------------------------------------------------------------
	// 5. Handle conflict or success
	// -------------------------------------------------------------------------
	if (updateResult.length === 0) {
		// Re-SELECT to get current version
		const currentCandidate = await db.query.candidate.findFirst({
			where: eq(candidate.id, candidateId),
		});

		if (!currentCandidate) {
			// Candidate was deleted between check and update
			return apiError(c, 404, 'NOT_FOUND', 'Candidate not found');
		}

		// Version conflict
		return apiError(c, 409, 'VERSION_CONFLICT', 'Candidate was modified by another request', { currentVersion: currentCandidate.version });
	}

	// Success - return updated candidate
	const updatedCandidate = updateResult[0];

	return c.json({
		candidate: {
			id: updatedCandidate.id,
			position: updatedCandidate.position,
			term: updatedCandidate.term,
			normalizedTerm: updatedCandidate.normalizedTerm,
			status: updatedCandidate.status,
			chosenBucket: updatedCandidate.chosenBucket,
			chosenText: updatedCandidate.chosenText,
			suggestedBucket: updatedCandidate.suggestedBucket,
			suggestedText: updatedCandidate.suggestedText,
			suggestionStatus: updatedCandidate.suggestionStatus,
			suggestionError: updatedCandidate.suggestionError,
			suggestionAttempts: updatedCandidate.suggestionAttempts,
			version: updatedCandidate.version,
			materializedTermId: updatedCandidate.materializedTermId,
			materializedTermSenseId: updatedCandidate.materializedTermSenseId,
			createdAt: updatedCandidate.createdAt.getTime(),
			updatedAt: updatedCandidate.updatedAt.getTime(),
		},
	});
});

export { candidateRoutes };
