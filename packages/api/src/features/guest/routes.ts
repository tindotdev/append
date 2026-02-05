/**
 * Guest/trial routes.
 *
 * POST /api/guest/import-terms - import local trial terms into an authenticated account
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, apiErrorFrom, validationHook } from '../../shared/api-error';
import { importGuestTerms } from './usecases/importGuestTerms';
import { ImportGuestTermsSchema, withCanonicals } from './validation/importGuestTerms.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

export const guestRoutes = app.post(
	'/import-terms',
	bodyLimit({ maxSize: 64 * 1024, onError: (c) => apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large') }),
	vValidator('json', ImportGuestTermsSchema, validationHook),
	async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const body = c.req.valid('json');

		const input = withCanonicals(body);
		const result = await importGuestTerms(db, c.env.DB, userId, input);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				idempotency_conflict: { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: (e) => e.message },
				invalid_bucket: { status: 400, code: 'VALIDATION_ERROR', message: (e) => e.message, details: (e) => ({ slug: e.slug }) },
				internal_error: { status: 500, code: 'INTERNAL_ERROR', message: (e) => e.message },
			});
		}

		return c.json(result.result, result.isReplay ? 200 : 201);
	}
);
