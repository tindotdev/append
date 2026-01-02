/**
 * Import routes: upload, preview, commit, and history.
 */

import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/env';
import { apiErrorFrom, validationHook } from '../../shared/api-error';
import { commitImport } from './usecases/commitImport';
import { getImportHistory } from './usecases/getImportHistory';
import { previewImport } from './usecases/previewImport';
import { uploadFiles } from './usecases/uploadFiles';
import { CommitImportSchema, PreviewImportSchema } from './validation/import.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Import routes - chained for Hono RPC type inference.
 *
 * POST /api/import/upload - Upload markdown files to R2
 * POST /api/import/preview - Parse uploaded files and return preview
 * POST /api/import/commit - Commit import (create terms/senses)
 */
export const importRoutes = app
	.post('/upload', async (c) => {
		const userId = c.get('userId');
		const r2 = c.env.IMPORT_FILES;

		// Get client-provided importId from header or form data
		const headerImportId = c.req.header('X-Import-Id');

		// Parse multipart form data
		const formData = await c.req.formData();
		const files: File[] = [];
		let formImportId: string | undefined;

		for (const [key, value] of formData.entries()) {
			if (value instanceof File) {
				files.push(value);
			} else if (key === 'importId' && typeof value === 'string') {
				formImportId = value;
			}
		}

		// Use client-provided importId (header takes precedence, then form data)
		const clientImportId = headerImportId || formImportId;

		// Execute use case
		const result = await uploadFiles(r2, userId, files, clientImportId);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				no_files: { status: 400, code: 'VALIDATION_ERROR', message: (error) => error.message },
				invalid_file_type: { status: 400, code: 'VALIDATION_ERROR', message: (error) => error.message },
				file_too_large: { status: 413, code: 'PAYLOAD_TOO_LARGE', message: (error) => error.message },
			});
		}

		return c.json(result.result, 201);
	})
	.post('/preview', vValidator('json', PreviewImportSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const r2 = c.env.IMPORT_FILES;
		const body = c.req.valid('json');

		// Execute use case
		const result = await previewImport(db, r2, userId, body.importId);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				not_found: { status: 404, code: 'NOT_FOUND', message: (error) => error.message },
			});
		}

		return c.json(result.result);
	})
	.post('/commit', vValidator('json', CommitImportSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const r2 = c.env.IMPORT_FILES;
		const body = c.req.valid('json');

		// Execute use case
		const result = await commitImport(db, c.env.DB, r2, userId, body);

		if (!result.success) {
			return apiErrorFrom(c, result.error, {
				not_found: { status: 404, code: 'NOT_FOUND', message: (error) => error.message },
				bucket_limit_exceeded: { status: 400, code: 'VALIDATION_ERROR', message: (error) => error.message },
				idempotency_conflict: {
					status: 409,
					code: 'IDEMPOTENCY_CONFLICT',
					message: 'Import already committed with different payload',
				},
				internal_error: { status: 500, code: 'INTERNAL_ERROR', message: (error) => error.message },
			});
		}

		// Return 200 for replay, 201 for new commit
		const status = result.isReplay ? 200 : 201;
		return c.json(result.result, status);
	})
	.get('/history', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const limitParam = c.req.query('limit');
		const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10), 50) : 20;

		const result = await getImportHistory(db, userId, limit);

		return c.json(result);
	});
