/**
 * Import routes: upload, preview, and commit imports.
 */

import { vValidator } from '@hono/valibot-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { schema } from '../../db';
import type { Bindings, Variables } from '../../platform/env';
import { apiError, validationHook } from '../../shared/api-error';
import { commitImport } from './usecases/commitImport';
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
			switch (result.error.type) {
				case 'no_files':
					return apiError(c, 400, 'VALIDATION_ERROR', result.error.message);
				case 'invalid_file_type':
					return apiError(c, 400, 'VALIDATION_ERROR', result.error.message);
				case 'file_too_large':
					return apiError(c, 413, 'PAYLOAD_TOO_LARGE', result.error.message);
			}
		}

		return c.json(result.result, 201);
	})
	.post('/preview', vValidator('json', PreviewImportSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = drizzle(c.env.DB, { schema });
		const r2 = c.env.IMPORT_FILES;
		const body = c.req.valid('json');

		// Execute use case
		const result = await previewImport(db, r2, userId, body.importId);

		if (!result.success) {
			switch (result.error.type) {
				case 'not_found':
					return apiError(c, 404, 'NOT_FOUND', result.error.message);
			}
		}

		return c.json(result.result);
	})
	.post('/commit', vValidator('json', CommitImportSchema, validationHook), async (c) => {
		const userId = c.get('userId');
		const db = drizzle(c.env.DB, { schema });
		const r2 = c.env.IMPORT_FILES;
		const body = c.req.valid('json');

		// Execute use case
		const result = await commitImport(db, c.env.DB, r2, userId, body);

		if (!result.success) {
			switch (result.error.type) {
				case 'not_found':
					return apiError(c, 404, 'NOT_FOUND', result.error.message);
				case 'bucket_limit_exceeded':
					return apiError(c, 400, 'VALIDATION_ERROR', result.error.message);
				case 'idempotency_conflict':
					return apiError(c, 409, 'IDEMPOTENCY_CONFLICT', `Import already committed with different payload`);
				case 'internal_error':
					return apiError(c, 500, 'INTERNAL_ERROR', result.error.message);
			}
		}

		// Return 200 for replay, 201 for new commit
		const status = result.isReplay ? 200 : 201;
		return c.json(result.result, status);
	});
