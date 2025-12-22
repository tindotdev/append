import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, count, and, asc } from "drizzle-orm";
import { apiError } from "../lib/api-error";
import { generateUUID, sha256Hex, isValidUUID } from "../lib/crypto";
import {
	schema,
	batch,
	candidate,
	idempotencyKey,
	normalize,
	type BatchStatus,
} from "../db";

// =============================================================================
// Constants
// =============================================================================

const MAX_BODY_SIZE = 64 * 1024; // 64 KiB
const MIN_TERMS = 20;
const MAX_TERMS = 200;
const MAX_TERM_LENGTH = 200;
const IDEMPOTENCY_SCOPE = "capture_terms";

// =============================================================================
// Types
// =============================================================================

type Bindings = {
	DB: D1Database;
};

type Variables = {
	userId: string;
};

// =============================================================================
// Batch routes
// =============================================================================

const batchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * POST /api/batch - Create a new batch of candidates (idempotent)
 *
 * Request: { terms: string, clientRequestId: string }
 * Response: { id: string, candidateCount: number }
 */
batchRoutes.post("/", async (c) => {
	const userId = c.get("userId");
	const db = drizzle(c.env.DB, { schema });

	// -------------------------------------------------------------------------
	// 1. Enforce body size limit (streaming check before parsing)
	// -------------------------------------------------------------------------
	const contentLength = c.req.header("content-length");
	if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
		return apiError(c, 413, "PAYLOAD_TOO_LARGE", "Request body too large");
	}

	// Read body with limit enforcement
	const rawBody = await c.req.text();
	if (rawBody.length > MAX_BODY_SIZE) {
		return apiError(c, 413, "PAYLOAD_TOO_LARGE", "Request body too large");
	}

	// -------------------------------------------------------------------------
	// 2. Parse JSON
	// -------------------------------------------------------------------------
	let body: { terms?: unknown; clientRequestId?: unknown };
	try {
		body = JSON.parse(rawBody);
	} catch {
		return apiError(c, 400, "INVALID_JSON", "Invalid JSON in request body");
	}

	// -------------------------------------------------------------------------
	// 3. Validate clientRequestId (strict UUID)
	// -------------------------------------------------------------------------
	const { terms, clientRequestId } = body;

	if (typeof clientRequestId !== "string" || !clientRequestId) {
		return apiError(
			c,
			400,
			"VALIDATION_ERROR",
			"clientRequestId is required"
		);
	}

	if (!isValidUUID(clientRequestId)) {
		return apiError(
			c,
			400,
			"VALIDATION_ERROR",
			"clientRequestId must be a valid UUID"
		);
	}

	// -------------------------------------------------------------------------
	// 4. Validate and parse terms
	// -------------------------------------------------------------------------
	if (typeof terms !== "string") {
		return apiError(c, 400, "VALIDATION_ERROR", "terms is required");
	}

	// Split on \r?\n, trim each line, drop empty lines
	const termLines = terms
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (termLines.length === 0) {
		return apiError(c, 400, "VALIDATION_ERROR", "terms cannot be empty");
	}

	if (termLines.length < MIN_TERMS) {
		return apiError(
			c,
			400,
			"VALIDATION_ERROR",
			`At least ${MIN_TERMS} terms are required`
		);
	}

	if (termLines.length > MAX_TERMS) {
		return apiError(
			c,
			400,
			"VALIDATION_ERROR",
			`At most ${MAX_TERMS} terms are allowed`
		);
	}

	// Check per-line length
	for (let i = 0; i < termLines.length; i++) {
		if (termLines[i].length > MAX_TERM_LENGTH) {
			return apiError(
				c,
				400,
				"VALIDATION_ERROR",
				`Term at line ${i + 1} exceeds ${MAX_TERM_LENGTH} characters`
			);
		}
	}

	// -------------------------------------------------------------------------
	// 5. Compute request_hash for idempotency
	// -------------------------------------------------------------------------
	const canonicalTerms = termLines.join("\n");
	const requestHash = await sha256Hex(canonicalTerms);

	// -------------------------------------------------------------------------
	// 6. Idempotency check + batch creation (transactional)
	// -------------------------------------------------------------------------

	// Check for existing idempotency key
	const existingKey = await db.query.idempotencyKey.findFirst({
		where: and(
			eq(idempotencyKey.userId, userId),
			eq(idempotencyKey.scope, IDEMPOTENCY_SCOPE),
			eq(idempotencyKey.key, clientRequestId)
		),
	});

	if (existingKey) {
		// Check if hash matches (replay) or differs (conflict)
		if (existingKey.requestHash !== requestHash) {
			return apiError(
				c,
				409,
				"IDEMPOTENCY_CONFLICT",
				"clientRequestId was used with different request body"
			);
		}

		// Replay: parse result_ref and return existing batch
		const resultRefMatch = existingKey.resultRef.match(/^batch:(.+)$/);
		if (!resultRefMatch) {
			return apiError(
				c,
				500,
				"INTERNAL_ERROR",
				"Invalid idempotency result reference"
			);
		}

		const batchId = resultRefMatch[1];

		// Get candidate count for replay response
		const [countResult] = await db
			.select({ count: count() })
			.from(candidate)
			.where(eq(candidate.batchId, batchId));

		const candidateCount = countResult?.count ?? 0;

		// If batch doesn't exist, this is a DB integrity issue
		if (candidateCount === 0) {
			const existingBatch = await db.query.batch.findFirst({
				where: eq(batch.id, batchId),
			});
			if (!existingBatch) {
				return apiError(
					c,
					500,
					"INTERNAL_ERROR",
					"Referenced batch no longer exists"
				);
			}
		}

		return c.json({ id: batchId, candidateCount }, 200);
	}

	// -------------------------------------------------------------------------
	// 7. Create batch + candidates + idempotency key
	// -------------------------------------------------------------------------

	const batchId = generateUUID();
	const now = new Date();
	const initialStatus: BatchStatus = "captured";

	try {
		// Use D1's batch API for atomic operations
		// Note: D1 doesn't support true transactions, but batch operations are atomic
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

		const candidateStatements = termLines.map((term, position) => {
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

		const idempotencyStatement = db
			.insert(idempotencyKey)
			.values({
				userId,
				scope: IDEMPOTENCY_SCOPE,
				key: clientRequestId,
				requestHash,
				resultRef: `batch:${batchId}`,
				createdAt: now,
			})
			.toSQL();

		// Execute all statements in a D1 batch (atomic)
		const statements = [
			c.env.DB.prepare(batchStatement.sql).bind(...batchStatement.params),
			...candidateStatements.map((s) =>
				c.env.DB.prepare(s.sql).bind(...s.params)
			),
			c.env.DB.prepare(idempotencyStatement.sql).bind(
				...idempotencyStatement.params
			),
		];

		await c.env.DB.batch(statements);

		return c.json({ id: batchId, candidateCount: termLines.length }, 201);
	} catch (error) {
		// Handle race condition: if idempotency key insert fails due to PK conflict,
		// re-select and return replay or conflict
		if (
			error instanceof Error &&
			error.message.includes("UNIQUE constraint failed")
		) {
			const racedKey = await db.query.idempotencyKey.findFirst({
				where: and(
					eq(idempotencyKey.userId, userId),
					eq(idempotencyKey.scope, IDEMPOTENCY_SCOPE),
					eq(idempotencyKey.key, clientRequestId)
				),
			});

			if (racedKey) {
				if (racedKey.requestHash !== requestHash) {
					return apiError(
						c,
						409,
						"IDEMPOTENCY_CONFLICT",
						"clientRequestId was used with different request body"
					);
				}

				const resultRefMatch = racedKey.resultRef.match(/^batch:(.+)$/);
				if (resultRefMatch) {
					const existingBatchId = resultRefMatch[1];
					const [countResult] = await db
						.select({ count: count() })
						.from(candidate)
						.where(eq(candidate.batchId, existingBatchId));

					return c.json(
						{ id: existingBatchId, candidateCount: countResult?.count ?? 0 },
						200
					);
				}
			}
		}

		console.error("Batch creation error:", error);
		return apiError(c, 500, "INTERNAL_ERROR", "Failed to create batch");
	}
});

/**
 * GET /api/batch/:id - Get a batch by ID (owner-only)
 *
 * Response: {
 *   id: string,
 *   status: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   candidateCount: number,
 *   candidates: Array<{
 *     id: string,
 *     position: number,
 *     term: string,
 *     normalizedTerm: string,
 *     status: string,
 *     createdAt: number,
 *     updatedAt: number
 *   }>
 * }
 */
batchRoutes.get("/:id", async (c) => {
	const userId = c.get("userId");
	const batchId = c.req.param("id");
	const db = drizzle(c.env.DB, { schema });

	// Lookup batch by id
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
	});

	// 404 if missing
	if (!batchRow) {
		return apiError(c, 404, "NOT_FOUND", "Batch not found");
	}

	// 403 if not owner
	if (batchRow.userId !== userId) {
		return apiError(c, 403, "FORBIDDEN", "Access denied");
	}

	// Get candidates ordered by position
	const candidates = await db
		.select({
			id: candidate.id,
			position: candidate.position,
			term: candidate.term,
			normalizedTerm: candidate.normalizedTerm,
			status: candidate.status,
			createdAt: candidate.createdAt,
			updatedAt: candidate.updatedAt,
		})
		.from(candidate)
		.where(eq(candidate.batchId, batchId))
		.orderBy(asc(candidate.position));

	return c.json({
		id: batchRow.id,
		status: batchRow.status,
		createdAt: batchRow.createdAt.getTime(),
		updatedAt: batchRow.updatedAt.getTime(),
		candidateCount: candidates.length,
		candidates: candidates.map((cand) => ({
			id: cand.id,
			position: cand.position,
			term: cand.term,
			normalizedTerm: cand.normalizedTerm,
			status: cand.status,
			createdAt: cand.createdAt.getTime(),
			updatedAt: cand.updatedAt.getTime(),
		})),
	});
});

export { batchRoutes };
