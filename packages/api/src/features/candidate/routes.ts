/**
 * Candidate routes.
 *
 * PUT /api/candidate/:id - Update a candidate's chosen bucket/text
 * POST /api/candidate/:id/accept - Accept a single candidate
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, ownershipErrorMap, validationHook } from '../../shared/api-error';
import { acceptCandidate } from './usecases/acceptCandidate';
import { updateCandidate } from './usecases/updateCandidate';
import { AcceptCandidateSchema } from './validation/acceptCandidate.schema';
import { UpdateCandidateSchema } from './validation/updateCandidate.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const candidateAccessErrors = ownershipErrorMap('Candidate');

/**
 * Candidate routes - exported as the result of route chain for Hono RPC type inference.
 *
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
export const candidateRoutes = app
	.put('/:id', vValidator('json', UpdateCandidateSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const candidateId = c.req.param('id');
		const db = c.get('db');
		const body = c.req.valid('json');

		// Call usecase
		const result = await updateCandidate(db, userId, candidateId, body);
		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				...candidateAccessErrors,
				invalid_bucket: {
					status: 400,
					code: 'VALIDATION_ERROR',
					message: (error) => `Invalid chosenBucket: '${error.slug}' does not exist`,
				},
				version_conflict: {
					status: 409,
					code: 'VERSION_CONFLICT',
					message: 'Candidate was modified by another request',
					details: (error) => ({ currentVersion: error.currentVersion }),
				},
			});
		}

		return c.json({ candidate: result.result });
	})
	/**
	 * POST /api/candidate/:id/accept - Accept a single candidate (owner-only)
	 *
	 * Materializes the candidate to Term + TermSense.
	 *
	 * Request: {
	 *   clientRequestId: UUID (required, for idempotency),
	 *   expectedVersion: number (required, for optimistic locking)
	 * }
	 *
	 * Response 200: { candidate, termId, termSenseId, isNewTerm, flaggedReason }
	 * Errors: 400, 401, 403, 404, 409
	 */
	.post('/:id/accept', vValidator('json', AcceptCandidateSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const candidateId = c.req.param('id');
		const db = c.get('db');
		const body = c.req.valid('json');

		const result = await acceptCandidate(db, c.env.DB, userId, candidateId, body);
		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				...candidateAccessErrors,
				already_accepted: {
					status: 409,
					code: 'ALREADY_ACCEPTED',
					message: 'Candidate has already been accepted',
				},
				suggestion_in_progress: {
					status: 409,
					code: 'SUGGESTION_IN_PROGRESS',
					message: 'Cannot accept: suggestion is still being generated',
				},
				missing_effective_fields: {
					status: 409,
					code: 'CANDIDATE_NOT_READY',
					message: 'Cannot accept: candidate is missing bucket or definition',
				},
				version_conflict: {
					status: 409,
					code: 'VERSION_CONFLICT',
					message: 'Candidate was modified by another request',
					details: (error) => ({ currentVersion: error.currentVersion }),
				},
				idempotency_conflict: {
					status: 409,
					code: 'IDEMPOTENCY_CONFLICT',
					message: 'clientRequestId was used for a different candidate',
					details: (error) => ({ originalCandidateId: error.originalCandidateId }),
				},
				internal_error: {
					status: 500,
					code: 'INTERNAL_ERROR',
					message: (error) => error.message,
				},
			});
		}

		return c.json(result.result);
	});
