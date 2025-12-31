/**
 * Candidate routes.
 *
 * PUT /api/candidate/:id - Update a candidate's chosen bucket/text
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, validationHook } from '../../shared/api-error';
import { updateCandidate } from './usecases/updateCandidate';
import { UpdateCandidateSchema } from './validation/updateCandidate.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
export const candidateRoutes = app.put('/:id', vValidator('json', UpdateCandidateSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const candidateId = c.req.param('id');
	const db = c.get('db');
	const body = c.req.valid('json');

	// Call usecase
	const result = await updateCandidate(db, userId, candidateId, body);
	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			not_found: { status: 404, code: 'NOT_FOUND', message: 'Candidate not found' },
			forbidden: { status: 403, code: 'FORBIDDEN', message: 'Access denied' },
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
});
