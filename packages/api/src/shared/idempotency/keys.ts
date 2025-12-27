/**
 * Idempotency key management for safe API retries.
 *
 * Idempotency keys are stored as (userId, scope, key) tuples.
 * Each key stores a request hash for conflict detection and a result reference.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import { idempotencyKey, type schema } from '../../db';

export type IdempotencyScope = 'capture_terms' | 'accept_all';

export interface IdempotencyKeyRecord {
	userId: string;
	scope: string;
	key: string;
	requestHash: string;
	resultRef: string;
	createdAt: Date;
	expiresAt: Date | null;
}

/**
 * Check if an idempotency key exists for this (userId, scope, key) tuple.
 *
 * @returns The existing key record, or null if not found
 */
export async function findIdempotencyKey(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	scope: IdempotencyScope,
	key: string
): Promise<IdempotencyKeyRecord | null> {
	const existing = await db.query.idempotencyKey.findFirst({
		where: and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.scope, scope), eq(idempotencyKey.key, key)),
	});

	return existing ?? null;
}

/**
 * Result of checking idempotency key.
 */
export type IdempotencyCheckResult =
	| { status: 'new' }
	| { status: 'replay'; resultRef: string }
	| { status: 'conflict'; storedHash: string };

/**
 * Check idempotency key and determine if this is a new request, replay, or conflict.
 *
 * @param db - Drizzle D1 database instance
 * @param userId - User ID
 * @param scope - Idempotency scope (e.g., 'capture_terms', 'accept_all')
 * @param key - Client-provided idempotency key (usually clientRequestId)
 * @param requestHash - Hash of the current request body for conflict detection
 * @returns Check result indicating new, replay (with resultRef), or conflict (with storedHash)
 */
export async function checkIdempotencyKey(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	scope: IdempotencyScope,
	key: string,
	requestHash: string
): Promise<IdempotencyCheckResult> {
	const existing = await findIdempotencyKey(db, userId, scope, key);

	if (!existing) {
		return { status: 'new' };
	}

	if (existing.requestHash === requestHash) {
		return { status: 'replay', resultRef: existing.resultRef };
	}

	return { status: 'conflict', storedHash: existing.requestHash };
}

/**
 * Create an idempotency key record.
 *
 * Note: This should be called as part of a D1 batch operation along with
 * the main business logic to ensure atomicity. If a PK conflict occurs
 * (race condition), the caller should re-check the key.
 */
export function createIdempotencyKeyStatement(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	scope: IdempotencyScope,
	key: string,
	requestHash: string,
	resultRef: string
) {
	return db.insert(idempotencyKey).values({
		userId,
		scope,
		key,
		requestHash,
		resultRef,
	});
}
