/**
 * Term sense routes.
 *
 * PATCH /api/term-sense/:id - Update term sense text/bucket
 * POST /api/term-sense/:id/archive - Archive term sense (with primary replacement)
 * POST /api/term-sense/:id/restore - Restore term sense (optionally restore term)
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, ownershipErrorMap, validationHook } from '../../shared/api-error';
import { archiveTermSense } from './usecases/archiveTermSense';
import { restoreTermSense } from './usecases/restoreTermSense';
import { updateTermSense } from './usecases/updateTermSense';
import { ArchiveTermSenseSchema } from './validation/archiveTermSense.schema';
import { RestoreTermSenseSchema } from './validation/restoreTermSense.schema';
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

/**
 * POST /api/term-sense/:id/archive - Archive term sense (owner-only)
 *
 * If the archived sense is the term's primary sense, a replacement is
 * automatically selected (deterministic rules) or the term is archived.
 *
 * Request: {
 *   expectedVersion: number (required)
 * }
 *
 * Response 200: {
 *   sense: { id, termId, version, archivedAt },
 *   term?: { id, primarySenseId, version, archivedAt },
 *   noop?: boolean
 * }
 * Errors: 400, 401, 403, 404, 409
 */
app.post('/:id/archive', vValidator('json', ArchiveTermSenseSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const senseId = c.req.param('id');
	const db = c.get('db');
	const body = c.req.valid('json');

	const result = await archiveTermSense(db, userId, senseId, body);
	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			...termSenseAccessErrors,
			version_conflict: {
				status: 409,
				code: 'VERSION_CONFLICT',
				message: 'Term sense was modified by another request',
				details: (error) => ({ currentVersion: error.currentVersion }),
			},
		});
	}

	return c.json(result.result);
});

/**
 * POST /api/term-sense/:id/restore - Restore term sense (owner-only)
 *
 * If the parent term is archived, it is also restored.
 *
 * Request: {
 *   expectedVersion: number (required)
 * }
 *
 * Response 200: {
 *   sense: { id, termId, version, archivedAt: null },
 *   term?: { id, primarySenseId, version, archivedAt: null },
 *   noop?: boolean
 * }
 * Errors: 400, 401, 403, 404, 409
 */
app.post('/:id/restore', vValidator('json', RestoreTermSenseSchema, validationHook), async (c) => {
	const userId = c.get('userId');
	const senseId = c.req.param('id');
	const db = c.get('db');
	const body = c.req.valid('json');

	const result = await restoreTermSense(db, userId, senseId, body);
	if (!result.success) {
		return apiErrorFrom(c, result.error, {
			...termSenseAccessErrors,
			version_conflict: {
				status: 409,
				code: 'VERSION_CONFLICT',
				message: 'Term sense was modified by another request',
				details: (error) => ({ currentVersion: error.currentVersion }),
			},
		});
	}

	return c.json(result.result);
});

export const termSenseRoutes = app;
