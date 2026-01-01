/**
 * Use case: Capture terms into a new batch.
 *
 * Creates a batch with candidate rows for each term, with idempotency handling.
 */

import { count, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type BatchStatus, batch, candidate, normalize, type schema } from '../../../db';
import { generateUUID, sha256Hex } from '../../../shared/crypto';
import { checkIdempotencyKey, createIdempotencyKeyStatement, findIdempotencyKey } from '../../../shared/idempotency/keys';
import { formatResultRef, parseResultRef } from '../../../shared/idempotency/result-ref';
import type { CaptureTermsInput } from '../validation/captureTerms.schema';

/**
 * Idempotency scope for batch capture.
 */
const IDEMPOTENCY_SCOPE = 'capture_terms' as const;

/**
 * Result of capturing terms.
 */
export interface CaptureTermsResult {
	id: string;
	candidateCount: number;
	isReplay: boolean;
}

/**
 * Error types for capture terms.
 */
export type CaptureTermsError = { type: 'idempotency_conflict'; message: string } | { type: 'internal_error'; message: string };

/**
 * Capture terms into a new batch.
 *
 * @param db - Drizzle D1 database instance
 * @param rawDb - Raw D1 database for batch operations
 * @param userId - User ID
 * @param input - Validated input with terms and clientRequestId
 * @returns Result with batch ID and candidate count, or an error
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates batch creation with idempotency
export async function captureTerms(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	input: CaptureTermsInput
): Promise<{ success: true; result: CaptureTermsResult } | { success: false; error: CaptureTermsError }> {
	const { terms, clientRequestId } = input;

	// Compute request hash for idempotency
	const canonicalTerms = terms.join('\n');
	const requestHash = await sha256Hex(canonicalTerms);

	// Check idempotency key
	const idempotencyCheck = await checkIdempotencyKey(db, userId, IDEMPOTENCY_SCOPE, clientRequestId, requestHash);

	if (idempotencyCheck.status === 'replay') {
		const batchId = parseResultRef(idempotencyCheck.resultRef, 'batch');
		if (!batchId) {
			return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
		}

		// Get candidate count for replay response
		const [countResult] = await db.select({ count: count() }).from(candidate).where(eq(candidate.batchId, batchId));

		return {
			success: true,
			result: {
				id: batchId,
				candidateCount: countResult?.count ?? 0,
				isReplay: true,
			},
		};
	}

	if (idempotencyCheck.status === 'conflict') {
		return {
			success: false,
			error: { type: 'idempotency_conflict', message: 'clientRequestId was used with different request body' },
		};
	}

	// Create batch + candidates + idempotency key atomically
	const batchId = generateUUID();
	const now = new Date();
	const initialStatus: BatchStatus = 'captured';

	try {
		// Build SQL statements
		const batchStatement = db
			.insert(batch)
			.values({
				id: batchId,
				userId,
				status: initialStatus,
				createdAt: now,
				updatedAt: now,
			})
			.toSQL();

		const candidateStatements = terms.map((term, position) => {
			return db
				.insert(candidate)
				.values({
					id: generateUUID(),
					batchId,
					position,
					term,
					normalizedTerm: normalize(term),
					status: initialStatus,
					version: 1,
					createdAt: now,
					updatedAt: now,
				})
				.toSQL();
		});

		const idempotencyStatement = createIdempotencyKeyStatement(
			db,
			userId,
			IDEMPOTENCY_SCOPE,
			clientRequestId,
			requestHash,
			formatResultRef('batch', batchId),
			{ createdAt: now }
		).toSQL();

		// Execute all statements in a D1 batch (atomic)
		const statements = [
			rawDb.prepare(batchStatement.sql).bind(...batchStatement.params),
			...candidateStatements.map((s) => rawDb.prepare(s.sql).bind(...s.params)),
			rawDb.prepare(idempotencyStatement.sql).bind(...idempotencyStatement.params),
		];

		await rawDb.batch(statements);

		return {
			success: true,
			result: {
				id: batchId,
				candidateCount: terms.length,
				isReplay: false,
			},
		};
	} catch (error) {
		// Handle race condition: if idempotency key insert fails due to PK conflict
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			const racedKey = await findIdempotencyKey(db, userId, IDEMPOTENCY_SCOPE, clientRequestId);

			if (racedKey) {
				if (racedKey.requestHash !== requestHash) {
					return {
						success: false,
						error: { type: 'idempotency_conflict', message: 'clientRequestId was used with different request body' },
					};
				}

				const existingBatchId = parseResultRef(racedKey.resultRef, 'batch');
				if (existingBatchId) {
					const [countResult] = await db.select({ count: count() }).from(candidate).where(eq(candidate.batchId, existingBatchId));

					return {
						success: true,
						result: {
							id: existingBatchId,
							candidateCount: countResult?.count ?? 0,
							isReplay: true,
						},
					};
				}
			}
		}

		console.error('Batch creation error:', error);
		return { success: false, error: { type: 'internal_error', message: 'Failed to create batch' } };
	}
}
