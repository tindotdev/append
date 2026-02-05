/**
 * Account routes.
 *
 * POST /api/account/delete - hard delete the authenticated account (ADR 0027)
 */

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as v from 'valibot';
import { user } from '../../db';
import { sha256Hex } from '../../lib/auth/device-token';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const DeleteAccountRequestSchema = v.object({
	email: v.pipe(
		v.string(),
		v.transform((s) => s.trim().toLowerCase()),
		v.email()
	),
	confirm: v.pipe(
		v.string(),
		v.transform((s) => s.trim().toUpperCase()),
		v.check((s) => s === 'DELETE', 'Type DELETE to confirm')
	),
});

function firstIssueMessage(issues: v.BaseIssue<unknown>[] | undefined): string {
	return issues?.[0]?.message ?? 'Validation failed';
}

export const accountRoutes = app.post('/delete', async (c) => {
	const userId = c.get('userId');
	const db = c.get('db');

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return apiError(c, 400, 'INVALID_JSON', 'Invalid JSON body');
	}

	const parsed = v.safeParse(DeleteAccountRequestSchema, body);
	if (!parsed.success) {
		return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(parsed.issues));
	}

	// Confirm the request is for the currently authenticated account.
	// (Avoids accidental deletion if the UI is stale or a user is sharing a machine.)
	const [existing] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);

	// Idempotent success: if the session is valid but the user row is missing,
	// treat it as already deleted.
	if (!existing) {
		return c.body(null, 204);
	}

	if (existing.email.trim().toLowerCase() !== parsed.output.email) {
		return apiError(c, 403, 'FORBIDDEN', 'Email does not match the authenticated account');
	}

	// ADR 0027: hard delete by deleting the user row and relying on FK cascades.
	await db.delete(user).where(eq(user.id, userId));

	// Minimal audit/ops log (no PII).
	try {
		console.log('account_deleted', {
			user_id_hash: await sha256Hex(userId),
			cf_ray: c.req.header('cf-ray') ?? null,
		});
	} catch {
		// Non-fatal: deletion already succeeded.
	}

	return c.body(null, 204);
});
