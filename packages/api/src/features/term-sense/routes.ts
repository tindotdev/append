/**
 * Term sense routes.
 *
 * PATCH /api/term-sense/:id - Update term sense text/bucket
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, ownershipErrorMap, validationHook } from '../../shared/api-error';
import { updateTermSense } from './usecases/updateTermSense';
import { UpdateTermSenseSchema } from './validation/updateTermSense.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const termSenseAccessErrors = ownershipErrorMap('Term sense');

/**
 * PATCH /api/term-sense/:id - Update term sense text/bucket (owner-only)
 *
 * Request: {
 *   expectedVersion: number (required),
 *   text?: string (optional),
 *   bucket?: string | null (optional)
 * }
 *
 * Response 200: { sense: <TermSense> }
 * Errors: 400, 401, 403, 404, 409
 */
app.patch('/:id', vValidator('json', UpdateTermSenseSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const senseId = c.req.param('id');
	const db = c.get('db');
	const body = c.req.valid('json');

	const result = await updateTermSense(db, userId, senseId, body);
	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			...termSenseAccessErrors,
			invalid_bucket: {
				status: 400,
				code: 'VALIDATION_ERROR',
				message: (error) => `Invalid bucket: '${error.slug}' does not exist`,
			},
			version_conflict: {
				status: 409,
				code: 'VERSION_CONFLICT',
				message: 'Term sense was modified by another request',
				details: (error) => ({ currentVersion: error.currentVersion }),
			},
		});
	}

	return c.json({ sense: result.result });
});

export const termSenseRoutes = app;
