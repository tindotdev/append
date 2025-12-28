/**
 * Candidate routes.
 *
 * PUT /api/candidate/:id - Update a candidate's chosen bucket/text
 */

import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as v from 'valibot';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';
import { updateCandidate } from './usecases/updateCandidate';
import { UpdateCandidateSchema } from './validation/updateCandidate.schema';

export const candidateRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

	// Parse JSON body
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return apiError(c, 400, 'INVALID_JSON', 'Invalid JSON in request body');
	}

	// Validate with Valibot
	const parseResult = v.safeParse(UpdateCandidateSchema, body);
	if (!parseResult.success) {
		const issue = parseResult.issues[0];
		return apiError(c, 400, 'VALIDATION_ERROR', issue.message);
	}

	// Call usecase
	const result = await updateCandidate(db, userId, candidateId, parseResult.output);
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
