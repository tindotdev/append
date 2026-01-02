/**
 * Term routes.
 *
 * GET /api/term/:id - Get term with all senses
 * PATCH /api/term/:id - Update term displayTerm
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, validationHook } from '../../shared/api-error';
import { getTerm } from './usecases/getTerm';
import { updateTerm } from './usecases/updateTerm';
import { UpdateTermSchema } from './validation/updateTerm.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/term/:id - Get term with all senses
 *
 * Response 200: { term: {...}, senses: [...] }
 * Errors: 401, 403, 404
 */
app.get('/:id', async (c) => {
	const userId = c.get('userId');
	const termId = c.req.param('id');
	const db = c.get('db');

	const result = await getTerm(db, userId, termId);
	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			not_found: { status: 404, code: 'NOT_FOUND', message: 'Term not found' },
			forbidden: { status: 403, code: 'FORBIDDEN', message: 'Access denied' },
		});
	}

	return c.json(result.result);
});

/**
 * PATCH /api/term/:id - Update term displayTerm (owner-only)
 *
 * Request: {
 *   expectedVersion: number (required),
 *   displayTerm: string (required)
 * }
 *
 * Response 200: { term: <Term> }
 * Errors: 400, 401, 403, 404, 409
 */
app.patch('/:id', vValidator('json', UpdateTermSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const termId = c.req.param('id');
	const db = c.get('db');
	const body = c.req.valid('json');

	const result = await updateTerm(db, userId, termId, body);
	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			not_found: { status: 404, code: 'NOT_FOUND', message: 'Term not found' },
			forbidden: { status: 403, code: 'FORBIDDEN', message: 'Access denied' },
			version_conflict: {
				status: 409,
				code: 'VERSION_CONFLICT',
				message: 'Term was modified by another request',
				details: (error) => ({ currentVersion: error.currentVersion }),
			},
		});
	}

	return c.json({ term: result.result });
});

export const termRoutes = app;
