/**
 * Device token routes.
 *
 * POST /api/device-tokens - mint a new device token (returns token once)
 * GET /api/device-tokens - list tokens
 * DELETE /api/device-tokens/:id - revoke token
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import * as v from 'valibot';
import { deviceToken } from '../../db';
import { generateDeviceToken, sha256Hex } from '../../lib/auth/device-token';
import type { Bindings, Variables } from '../../platform/env';
import { apiError } from '../../shared/api-error';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const CreateDeviceTokenRequestSchema = v.object({
	label: v.optional(v.pipe(v.string(), v.maxLength(64, 'label must be <= 64 chars'))),
	expires_in_days: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3650, 'expiration must be <= 10 years'))),
});

function firstIssueMessage(issues: v.BaseIssue<unknown>[] | undefined): string {
	return issues?.[0]?.message ?? 'Validation failed';
}

export const deviceTokenRoutes = app
	.post('/', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const body = (await c.req.json()) as unknown;
		const parsed = v.safeParse(CreateDeviceTokenRequestSchema, body);
		if (!parsed.success) {
			return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(parsed.issues));
		}

		const token = generateDeviceToken();
		const tokenHash = await sha256Hex(token);
		const tokenPrefix = token.slice(0, 12);
		const id = crypto.randomUUID();
		const createdAt = new Date();

		// Calculate expiration date if expires_in_days is provided
		const expiresAt = parsed.output.expires_in_days
			? new Date(createdAt.getTime() + parsed.output.expires_in_days * 24 * 60 * 60 * 1000)
			: null;

		await db.insert(deviceToken).values({
			id,
			userId,
			label: parsed.output.label ?? null,
			tokenPrefix,
			tokenHash,
			createdAt,
			expiresAt,
		});

		return c.json({
			token_id: id,
			token,
			created_at_ms: createdAt.getTime(),
			expires_at_ms: expiresAt?.getTime() ?? null,
		});
	})
	.get('/', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const rows = await db
			.select({
				id: deviceToken.id,
				label: deviceToken.label,
				tokenPrefix: deviceToken.tokenPrefix,
				createdAt: deviceToken.createdAt,
				lastUsedAt: deviceToken.lastUsedAt,
				expiresAt: deviceToken.expiresAt,
				revokedAt: deviceToken.revokedAt,
			})
			.from(deviceToken)
			.where(eq(deviceToken.userId, userId))
			.orderBy(desc(deviceToken.createdAt))
			.limit(100);

		return c.json({
			tokens: rows.map((r) => ({
				id: r.id,
				label: r.label,
				token_prefix: r.tokenPrefix,
				created_at_ms: r.createdAt.getTime(),
				last_used_at_ms: r.lastUsedAt?.getTime() ?? null,
				expires_at_ms: r.expiresAt?.getTime() ?? null,
				revoked_at_ms: r.revokedAt?.getTime() ?? null,
			})),
		});
	})
	.delete('/:id', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');
		const id = c.req.param('id');
		const now = new Date();

		const [existing] = await db
			.select({ id: deviceToken.id })
			.from(deviceToken)
			.where(and(eq(deviceToken.id, id), eq(deviceToken.userId, userId), isNull(deviceToken.revokedAt)))
			.limit(1);

		if (!existing) {
			return apiError(c, 404, 'NOT_FOUND', 'Token not found');
		}

		await db.update(deviceToken).set({ revokedAt: now }).where(eq(deviceToken.id, id));

		return c.body(null, 204);
	});
