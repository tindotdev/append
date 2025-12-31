/**
 * Candidate routes.
 *
 * PUT /api/candidate/:id - Update a candidate's chosen bucket/text
 */

import { vValidator } from '@hono/valibot-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, validationHook } from '../../shared/api-error';
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
	const db = drizzle(c.env.DB, { schema });
	const body = c.req.valid('json');

	// Call usecase
	const result = await updateCandidate(db, userId, candidateId, body);
	if (!result.success) {
		switch (result.error.type) {
			case 'not_found':
				return apiError(c, 404, 'NOT_FOUND', 'Candidate not found');
			case 'forbidden':
				return apiError(c, 403, 'FORBIDDEN', 'Access denied');
			case 'version_conflict':
				return apiError(c, 409, 'VERSION_CONFLICT', 'Candidate was modified by another request', {
					currentVersion: result.error.currentVersion,
				});
		}
	}

	return c.json({ candidate: result.result });
});
