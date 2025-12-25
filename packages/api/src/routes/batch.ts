import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, count, and, asc, isNull, or, lt, sql } from "drizzle-orm";
import { apiError } from "../lib/api-error";
import { generateUUID, sha256Hex, isValidUUID } from "../lib/crypto";
import {
	schema,
	batch,
	candidate,
	idempotencyKey,
	suggestionCache,
	term,
	termSense,
	normalize,
	type BatchStatus,
	type Bucket,
	type SuggestionStatus,
	type TermSenseSource,
} from "../db";
import {
	generateStubSuggestion,
	generateOpenAISuggestion,
	type SuggestionProvider,
	type AIGatewayConfig,
	SUGGESTION_MODEL,
	PROMPT_VERSION,
	MAX_SUGGESTION_ATTEMPTS,
	SUGGESTION_TIMEOUT_MS,
	DEFAULT_LIMIT,
	MIN_LIMIT,
	MAX_LIMIT,
} from "../lib/suggestions";

// =============================================================================
// Constants
// =============================================================================

const MAX_BODY_SIZE = 64 * 1024; // 64 KiB
const MIN_TERMS = 20;
const MAX_TERMS = 200;
const MAX_TERM_LENGTH = 200;
const IDEMPOTENCY_SCOPE = "capture_terms";
const ACCEPT_ALL_SCOPE = "accept_all";

// =============================================================================
// Types
// =============================================================================

type Bindings = {
	DB: D1Database;
	SUGGESTIONS_PROVIDER?: string;
	CF_AIG_TOKEN?: string;
	AI_GATEWAY_ID?: string;
	AI: Ai;
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
 *   status: "captured" | "suggested" | "accepted",
 *   createdAt: number (epoch ms),
 *   updatedAt: number (epoch ms),
 *   candidateCount: number,
 *   candidates: Array<{
 *     id: string,
 *     position: number,
 *     term: string,
 *     normalizedTerm: string,
 *     status: "captured" | "suggested" | "accepted",
 *     chosenBucket: Bucket | null,
 *     chosenText: string | null,
 *     suggestedBucket: Bucket | null,
 *     suggestedText: string | null,
 *     suggestionStatus: "in_progress" | "done" | "error" | null,
 *     suggestionError: string | null,
 *     suggestionAttempts: number,
 *     version: number,
 *     materializedTermId: string | null,
 *     materializedTermSenseId: string | null,
 *     createdAt: number (epoch ms),
 *     updatedAt: number (epoch ms)
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
			chosenBucket: candidate.chosenBucket,
			chosenText: candidate.chosenText,
			suggestedBucket: candidate.suggestedBucket,
			suggestedText: candidate.suggestedText,
			suggestionStatus: candidate.suggestionStatus,
			suggestionError: candidate.suggestionError,
			suggestionAttempts: candidate.suggestionAttempts,
			version: candidate.version,
			materializedTermId: candidate.materializedTermId,
			materializedTermSenseId: candidate.materializedTermSenseId,
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
			chosenBucket: cand.chosenBucket,
			chosenText: cand.chosenText,
			suggestedBucket: cand.suggestedBucket,
			suggestedText: cand.suggestedText,
			suggestionStatus: cand.suggestionStatus,
			suggestionError: cand.suggestionError,
			suggestionAttempts: cand.suggestionAttempts,
			version: cand.version,
			materializedTermId: cand.materializedTermId,
			materializedTermSenseId: cand.materializedTermSenseId,
			createdAt: cand.createdAt.getTime(),
			updatedAt: cand.updatedAt.getTime(),
		})),
	});
});

/**
 * POST /api/batch/:id/suggest - Generate suggestions for a batch's candidates
 *
 * Query params:
 *   - limit (optional): integer, default 50, min 1, max 200
 *   - regenerate (optional): "1" to enable regenerate mode; default is fill-missing
 *
 * Response: {
 *   batchId: string,
 *   mode: "fill-missing" | "regenerate",
 *   limit: number,
 *   candidateCount: number,
 *   eligibleCount: number,
 *   results: {
 *     suggested: number,
 *     cached: number,
 *     skippedAlreadySuggested: number,
 *     skippedInProgress: number,
 *     errors: number
 *   }
 * }
 */
batchRoutes.post("/:id/suggest", async (c) => {
	const userId = c.get("userId");
	const batchId = c.req.param("id");
	const db = drizzle(c.env.DB, { schema });

	// -------------------------------------------------------------------------
	// 1. Validate query params
	// -------------------------------------------------------------------------
	const limitParam = c.req.query("limit");
	const regenerateParam = c.req.query("regenerate");

	let limit = DEFAULT_LIMIT;
	if (limitParam !== undefined) {
		const parsed = parseInt(limitParam, 10);
		if (isNaN(parsed) || parsed < MIN_LIMIT || parsed > MAX_LIMIT) {
			return apiError(
				c,
				400,
				"VALIDATION_ERROR",
				`limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`
			);
		}
		limit = parsed;
	}

	const isRegenerate = regenerateParam === "1";
	const mode = isRegenerate ? "regenerate" : "fill-missing";

	// -------------------------------------------------------------------------
	// 2. Check provider configuration
	// -------------------------------------------------------------------------
	const provider = (c.env.SUGGESTIONS_PROVIDER || "openai") as SuggestionProvider;

	if (provider === "disabled") {
		return apiError(c, 503, "SERVICE_UNAVAILABLE", "Suggestions are disabled");
	}

	if (provider === "openai") {
		if (!c.env.CF_AIG_TOKEN || !c.env.AI_GATEWAY_ID) {
			return apiError(
				c,
				500,
				"CONFIGURATION_ERROR",
				"OpenAI provider requires CF_AIG_TOKEN and AI_GATEWAY_ID"
			);
		}
	}

	// -------------------------------------------------------------------------
	// 3. Lookup batch and verify ownership
	// -------------------------------------------------------------------------
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
	});

	if (!batchRow) {
		return apiError(c, 404, "NOT_FOUND", "Batch not found");
	}

	if (batchRow.userId !== userId) {
		return apiError(c, 403, "FORBIDDEN", "Access denied");
	}

	// -------------------------------------------------------------------------
	// 4. Get all candidates for this batch (for counting)
	// -------------------------------------------------------------------------
	const allCandidates = await db
		.select({
			id: candidate.id,
			normalizedTerm: candidate.normalizedTerm,
			term: candidate.term,
			position: candidate.position,
			suggestedBucket: candidate.suggestedBucket,
			suggestedText: candidate.suggestedText,
			suggestionStatus: candidate.suggestionStatus,
			suggestionAttempts: candidate.suggestionAttempts,
		})
		.from(candidate)
		.where(eq(candidate.batchId, batchId))
		.orderBy(asc(candidate.position));

	const candidateCount = allCandidates.length;

	// -------------------------------------------------------------------------
	// 5. Determine eligible candidates based on mode
	// -------------------------------------------------------------------------
	const eligibleCandidates = allCandidates.filter((cand) => {
		// Never process candidates at max attempts
		if (cand.suggestionAttempts >= MAX_SUGGESTION_ATTEMPTS) {
			return false;
		}

		if (isRegenerate) {
			// Regenerate mode: all candidates with attempts < 3
			return true;
		}

		// Fill-missing mode:
		// - Skip already suggested (has both bucket and text)
		// - Skip in_progress
		// - Include null/error status for retry
		if (cand.suggestedBucket !== null && cand.suggestedText !== null) {
			return false;
		}
		if (cand.suggestionStatus === "in_progress") {
			return false;
		}
		return true;
	});

	// Count skipped reasons for response
	let skippedAlreadySuggested = 0;
	let skippedInProgress = 0;

	if (!isRegenerate) {
		for (const cand of allCandidates) {
			if (cand.suggestedBucket !== null && cand.suggestedText !== null) {
				skippedAlreadySuggested++;
			} else if (cand.suggestionStatus === "in_progress") {
				skippedInProgress++;
			}
		}
	}

	// Apply limit
	const candidatesToProcess = eligibleCandidates.slice(0, limit);
	const eligibleCount = candidatesToProcess.length;

	// -------------------------------------------------------------------------
	// 6. Process candidates with bounded concurrency
	// -------------------------------------------------------------------------
	const results = {
		suggested: 0,
		cached: 0,
		skippedAlreadySuggested,
		skippedInProgress,
		errors: 0,
	};

	// Track terms we've already processed in this run (for within-batch cache hits)
	const processedTerms = new Map<string, { bucket: Bucket; text: string }>();

	// Process candidates sequentially (simpler and more memory efficient for Workers)
	// The stub provider is synchronous so concurrency isn't needed in test mode
	for (const cand of candidatesToProcess) {
		await processCandidate(
			cand,
			userId,
			batchId,
			provider,
			isRegenerate,
			processedTerms,
			results,
			db,
			c.env
		);
	}

	// -------------------------------------------------------------------------
	// 7. Update batch status to 'suggested'
	// -------------------------------------------------------------------------
	await db
		.update(batch)
		.set({ status: "suggested" as BatchStatus, updatedAt: new Date() })
		.where(eq(batch.id, batchId));

	// -------------------------------------------------------------------------
	// 8. Return response
	// -------------------------------------------------------------------------
	return c.json({
		batchId,
		mode,
		limit,
		candidateCount,
		eligibleCount,
		results,
	});
});

/**
 * Process a single candidate for suggestion generation.
 */
async function processCandidate(
	cand: {
		id: string;
		normalizedTerm: string;
		term: string;
		position: number;
		suggestedBucket: Bucket | null;
		suggestedText: string | null;
		suggestionStatus: SuggestionStatus | null;
		suggestionAttempts: number;
	},
	userId: string,
	_batchId: string,
	provider: SuggestionProvider,
	isRegenerate: boolean,
	processedTerms: Map<string, { bucket: Bucket; text: string }>,
	results: {
		suggested: number;
		cached: number;
		skippedAlreadySuggested: number;
		skippedInProgress: number;
		errors: number;
	},
	db: ReturnType<typeof drizzle>,
	env: Bindings
): Promise<void> {
	const now = new Date();

	// Check if we already processed this term in this batch run
	const inBatchCached = processedTerms.get(cand.normalizedTerm);
	if (inBatchCached && !isRegenerate) {
		// Use cached result from this batch run
		await db
			.update(candidate)
			.set({
				suggestedBucket: inBatchCached.bucket,
				suggestedText: inBatchCached.text,
				suggestionStatus: "done" as SuggestionStatus,
				suggestionError: null,
				suggestionUpdatedAt: now,
				status: "suggested" as BatchStatus,
				updatedAt: now,
			})
			.where(eq(candidate.id, cand.id));
		results.cached++;
		return;
	}

	// Check D1 cache (fill-missing mode only)
	if (!isRegenerate) {
		const [cachedSuggestion] = await db
			.select()
			.from(suggestionCache)
			.where(
				and(
					eq(suggestionCache.userId, userId),
					eq(suggestionCache.normalizedTerm, cand.normalizedTerm),
					eq(suggestionCache.model, SUGGESTION_MODEL),
					eq(suggestionCache.promptVersion, PROMPT_VERSION)
				)
			)
			.limit(1);

		if (cachedSuggestion) {
			// Use cached result
			await db
				.update(candidate)
				.set({
					suggestedBucket: cachedSuggestion.suggestedBucket,
					suggestedText: cachedSuggestion.suggestedText,
					suggestionStatus: "done" as SuggestionStatus,
					suggestionError: null,
					suggestionUpdatedAt: now,
					status: "suggested" as BatchStatus,
					updatedAt: now,
				})
				.where(eq(candidate.id, cand.id));

			// Add to in-batch cache
			processedTerms.set(cand.normalizedTerm, {
				bucket: cachedSuggestion.suggestedBucket,
				text: cachedSuggestion.suggestedText,
			});

			results.cached++;
			return;
		}
	}

	// Claim the candidate with conditional update
	const claimResult = await db
		.update(candidate)
		.set({
			suggestionStatus: "in_progress" as SuggestionStatus,
			suggestionAttempts: sql`${candidate.suggestionAttempts} + 1`,
			suggestionUpdatedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(candidate.id, cand.id),
				or(
					isNull(candidate.suggestionStatus),
					eq(candidate.suggestionStatus, "done"),
					eq(candidate.suggestionStatus, "error")
				),
				lt(candidate.suggestionAttempts, MAX_SUGGESTION_ATTEMPTS)
			)
		)
		.returning({ id: candidate.id });

	if (claimResult.length === 0) {
		// Failed to claim - someone else is processing or max attempts reached
		results.skippedInProgress++;
		return;
	}

	// Generate suggestion
	let suggestionResult: { bucket: Bucket; text: string } | null = null;
	let errorMessage: string | null = null;

	if (provider === "stub") {
		// Stub provider - deterministic
		const stub = generateStubSuggestion(cand.normalizedTerm);
		suggestionResult = stub;
	} else if (provider === "openai") {
		// OpenAI provider with timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), SUGGESTION_TIMEOUT_MS);

		try {
			// Get gateway URL using AI binding
			const gatewayBaseUrl = await env.AI.gateway(env.AI_GATEWAY_ID!).getUrl("openai");

			const config: AIGatewayConfig = {
				cfToken: env.CF_AIG_TOKEN!,
				gatewayBaseUrl,
			};

			const outcome = await generateOpenAISuggestion(
				cand.term,
				config,
				controller.signal
			);

			if (outcome.success) {
				suggestionResult = outcome.result;
			} else {
				errorMessage = `${outcome.error.code}: ${outcome.error.message}`;
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}

	// Update candidate with result
	if (suggestionResult) {
		await db
			.update(candidate)
			.set({
				suggestedBucket: suggestionResult.bucket,
				suggestedText: suggestionResult.text,
				suggestionStatus: "done" as SuggestionStatus,
				suggestionError: null,
				suggestionUpdatedAt: new Date(),
				status: "suggested" as BatchStatus,
				updatedAt: new Date(),
			})
			.where(eq(candidate.id, cand.id));

		// Add to in-batch cache
		processedTerms.set(cand.normalizedTerm, suggestionResult);

		// Upsert to D1 cache (fill-missing mode only)
		if (!isRegenerate) {
			try {
				await db
					.insert(suggestionCache)
					.values({
						id: generateUUID(),
						userId,
						normalizedTerm: cand.normalizedTerm,
						model: SUGGESTION_MODEL,
						promptVersion: PROMPT_VERSION,
						suggestedBucket: suggestionResult.bucket,
						suggestedText: suggestionResult.text,
						createdAt: new Date(),
						updatedAt: new Date(),
					})
					.onConflictDoUpdate({
						target: [
							suggestionCache.userId,
							suggestionCache.normalizedTerm,
							suggestionCache.model,
							suggestionCache.promptVersion,
						],
						set: {
							suggestedBucket: suggestionResult.bucket,
							suggestedText: suggestionResult.text,
							updatedAt: new Date(),
						},
					});
			} catch {
				// Cache upsert failure is non-fatal
			}
		}

		results.suggested++;
	} else {
		await db
			.update(candidate)
			.set({
				suggestionStatus: "error" as SuggestionStatus,
				suggestionError: errorMessage || "Unknown error",
				suggestionUpdatedAt: new Date(),
				status: "suggested" as BatchStatus,
				updatedAt: new Date(),
			})
			.where(eq(candidate.id, cand.id));

		results.errors++;
	}
}

// =============================================================================
// Base64url helpers (for idempotency result_ref encoding)
// =============================================================================

/**
 * Encode a string to base64url (no padding).
 */
function toBase64Url(input: string): string {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(input);
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode a base64url string to a regular string.
 */
function fromBase64Url(input: string): string {
	// Restore standard base64 characters
	let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
	// Add padding if needed
	while (base64.length % 4 !== 0) {
		base64 += "=";
	}
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

// =============================================================================
// Accept summary type
// =============================================================================

interface AcceptSummary {
	batchId: string;
	status: "accepted";
	candidateCount: number;
	acceptedCount: number;
	skippedAlreadyAcceptedCount: number;
	termCreatedCount: number;
	termSenseCreatedCount: number;
	flaggedCount: number;
}

/**
 * POST /api/batch/:id/accept - Accept all candidates and materialize to terms/senses
 *
 * Request body: { clientRequestId: string (UUID v4) }
 *
 * Response: AcceptSummary
 */
batchRoutes.post("/:id/accept", async (c) => {
	const userId = c.get("userId");
	const batchId = c.req.param("id");
	const db = drizzle(c.env.DB, { schema });

	// -------------------------------------------------------------------------
	// 1. Parse and validate request body
	// -------------------------------------------------------------------------
	let body: { clientRequestId?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return apiError(c, 400, "INVALID_JSON", "Invalid JSON in request body");
	}

	const { clientRequestId } = body;

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
	// 2. Lookup batch and verify ownership
	// -------------------------------------------------------------------------
	const batchRow = await db.query.batch.findFirst({
		where: eq(batch.id, batchId),
	});

	if (!batchRow) {
		return apiError(c, 404, "NOT_FOUND", "Batch not found");
	}

	if (batchRow.userId !== userId) {
		return apiError(c, 403, "FORBIDDEN", "Access denied");
	}

	// -------------------------------------------------------------------------
	// 3. Check idempotency key for replay/conflict
	// -------------------------------------------------------------------------
	const requestHash = await sha256Hex(`batch:${batchId}`);

	const existingKey = await db.query.idempotencyKey.findFirst({
		where: and(
			eq(idempotencyKey.userId, userId),
			eq(idempotencyKey.scope, ACCEPT_ALL_SCOPE),
			eq(idempotencyKey.key, clientRequestId)
		),
	});

	if (existingKey) {
		if (existingKey.requestHash === requestHash) {
			// Replay: decode and return cached summary
			const resultRefMatch = existingKey.resultRef.match(
				/^accept_summary:(.+)$/
			);
			if (!resultRefMatch) {
				return apiError(
					c,
					500,
					"INTERNAL_ERROR",
					"Invalid idempotency result reference"
				);
			}

			try {
				const summaryJson = fromBase64Url(resultRefMatch[1]);
				const cachedSummary = JSON.parse(summaryJson) as AcceptSummary;
				return c.json(cachedSummary, 200);
			} catch {
				return apiError(
					c,
					500,
					"INTERNAL_ERROR",
					"Invalid idempotency result reference"
				);
			}
		} else {
			// Conflict: same clientRequestId used for different batch
			// Extract originalBatchId from the stored result_ref
			const resultRefMatch = existingKey.resultRef.match(
				/^accept_summary:(.+)$/
			);
			let originalBatchId = "unknown";
			if (resultRefMatch) {
				try {
					const summaryJson = fromBase64Url(resultRefMatch[1]);
					const storedSummary = JSON.parse(summaryJson) as AcceptSummary;
					originalBatchId = storedSummary.batchId;
				} catch {
					// If we can't decode, return 500
					return apiError(
						c,
						500,
						"INTERNAL_ERROR",
						"Invalid idempotency result reference"
					);
				}
			}

			return apiError(
				c,
				409,
				"IDEMPOTENCY_CONFLICT",
				"clientRequestId was used for a different batch",
				{ originalBatchId }
			);
		}
	}

	// -------------------------------------------------------------------------
	// 4. Load all candidates for precondition checks
	// -------------------------------------------------------------------------
	const allCandidates = await db
		.select({
			id: candidate.id,
			position: candidate.position,
			term: candidate.term,
			normalizedTerm: candidate.normalizedTerm,
			chosenBucket: candidate.chosenBucket,
			chosenText: candidate.chosenText,
			suggestedBucket: candidate.suggestedBucket,
			suggestedText: candidate.suggestedText,
			suggestionStatus: candidate.suggestionStatus,
			materializedTermId: candidate.materializedTermId,
			materializedTermSenseId: candidate.materializedTermSenseId,
		})
		.from(candidate)
		.where(eq(candidate.batchId, batchId))
		.orderBy(asc(candidate.position));

	const candidateCount = allCandidates.length;

	// -------------------------------------------------------------------------
	// 5. Precondition: check for in-progress suggestions
	// -------------------------------------------------------------------------
	const inProgressIds = allCandidates
		.filter((c) => c.suggestionStatus === "in_progress")
		.map((c) => c.id);

	if (inProgressIds.length > 0) {
		return apiError(
			c,
			409,
			"BATCH_NOT_READY",
			"Some candidates have suggestions in progress",
			{
				reason: "SUGGESTIONS_IN_PROGRESS",
				inProgressCandidateIds: inProgressIds,
			}
		);
	}

	// -------------------------------------------------------------------------
	// 6. Compute effective fields and check for missing
	// -------------------------------------------------------------------------
	type CandidateWithEffective = (typeof allCandidates)[number] & {
		effectiveBucket: Bucket | null;
		effectiveText: string | null;
	};

	const candidatesWithEffective: CandidateWithEffective[] = allCandidates.map(
		(cand) => ({
			...cand,
			effectiveBucket: cand.chosenBucket ?? cand.suggestedBucket,
			effectiveText: cand.chosenText ?? cand.suggestedText,
		})
	);

	const missingIds = candidatesWithEffective
		.filter((c) => c.effectiveBucket === null || c.effectiveText === null)
		.map((c) => c.id);

	if (missingIds.length > 0) {
		return apiError(
			c,
			409,
			"BATCH_NOT_READY",
			"Some candidates are missing effective bucket or text",
			{
				reason: "MISSING_EFFECTIVE_FIELDS",
				missingCandidateIds: missingIds,
			}
		);
	}

	// -------------------------------------------------------------------------
	// 7. Phase 1: Build canonical → termId mapping
	// -------------------------------------------------------------------------

	// Filter unmaterialized candidates
	const unmaterializedCandidates = candidatesWithEffective.filter(
		(c) => c.materializedTermSenseId === null
	);

	// Count already materialized
	const skippedAlreadyAcceptedCount =
		candidateCount - unmaterializedCandidates.length;

	// Get unique canonicals from unmaterialized candidates
	const uniqueCanonicals = [
		...new Set(unmaterializedCandidates.map((c) => normalize(c.term))),
	];

	// Pre-fetch existing terms for this user
	type ExistingTermRow = {
		id: string;
		canonical: string;
		primarySenseId: string | null;
	};
	let existingTerms: ExistingTermRow[] = [];
	if (uniqueCanonicals.length > 0) {
		existingTerms = await db
			.select({
				id: term.id,
				canonical: term.canonical,
				primarySenseId: term.primarySenseId,
			})
			.from(term)
			.where(
				and(
					eq(term.userId, userId),
					sql`${term.canonical} IN (${sql.join(
						uniqueCanonicals.map((c) => sql`${c}`),
						sql`, `
					)})`
				)
			);
	}

	// Build map of existing terms: canonical → { termId, primarySenseId }
	const existingTermMap = new Map<
		string,
		{ termId: string; primarySenseId: string | null }
	>();
	for (const t of existingTerms) {
		existingTermMap.set(t.canonical, {
			termId: t.id,
			primarySenseId: t.primarySenseId,
		});
	}

	// Pre-fetch primary sense buckets for existing terms with primary senses
	const primarySenseIds = existingTerms
		.map((t) => t.primarySenseId)
		.filter((id): id is string => id !== null);

	type PrimarySenseRow = { id: string; bucket: Bucket };
	let primarySenses: PrimarySenseRow[] = [];
	if (primarySenseIds.length > 0) {
		primarySenses = await db
			.select({
				id: termSense.id,
				bucket: termSense.bucket,
			})
			.from(termSense)
			.where(
				sql`${termSense.id} IN (${sql.join(
					primarySenseIds.map((id) => sql`${id}`),
					sql`, `
				)})`
			);
	}

	// Build map of primary sense buckets
	const primarySenseBucketMap = new Map<string, Bucket>();
	for (const ps of primarySenses) {
		primarySenseBucketMap.set(ps.id, ps.bucket);
	}

	// Build canonical → termId map (including new terms to create)
	// Also track which candidates are "term creators"
	const canonicalToTermId = new Map<string, string>();
	const termCreatorCandidateIds = new Set<string>();

	for (const cand of unmaterializedCandidates) {
		const canonical = normalize(cand.term);

		if (!canonicalToTermId.has(canonical)) {
			const existing = existingTermMap.get(canonical);
			if (existing) {
				// Term already exists
				canonicalToTermId.set(canonical, existing.termId);
			} else {
				// New term - use deterministic ID from first candidate
				const newTermId = `term:${cand.id}`;
				canonicalToTermId.set(canonical, newTermId);
				termCreatorCandidateIds.add(cand.id);
			}
		}
	}

	// -------------------------------------------------------------------------
	// 8. Phase 2: Generate D1 batch statements
	// -------------------------------------------------------------------------
	const now = new Date();
	const nowMs = now.getTime();
	const statements: D1PreparedStatement[] = [];

	// Counters for summary
	let termCreatedCount = 0;
	let termSenseCreatedCount = 0;
	let flaggedCount = 0;

	for (const cand of unmaterializedCandidates) {
		const canonical = normalize(cand.term);
		const termId = canonicalToTermId.get(canonical)!;
		const termSenseId = `term_sense:${cand.id}`;

		// Effective fields (already validated non-null)
		const effectiveBucket = cand.effectiveBucket!;
		const effectiveText = cand.effectiveText!;

		// Determine if this candidate creates a new term
		if (termCreatorCandidateIds.has(cand.id)) {
			// INSERT OR IGNORE INTO term
			const termStmt = db
				.insert(term)
				.values({
					id: termId,
					userId,
					canonical,
					displayTerm: cand.term,
					primarySenseId: termSenseId,
					createdAt: now,
				})
				.onConflictDoNothing()
				.toSQL();

			statements.push(
				c.env.DB.prepare(termStmt.sql).bind(...termStmt.params)
			);
			termCreatedCount++;
		}

		// Determine flagged_reason
		let flaggedReason: string | null = null;
		const existingTermInfo = existingTermMap.get(canonical);
		if (existingTermInfo?.primarySenseId) {
			const primaryBucket = primarySenseBucketMap.get(
				existingTermInfo.primarySenseId
			);
			if (primaryBucket && primaryBucket !== effectiveBucket) {
				flaggedReason = "bucket_conflict";
				flaggedCount++;
			}
		}

		// INSERT OR IGNORE INTO term_sense
		const senseStmt = db
			.insert(termSense)
			.values({
				id: termSenseId,
				termId,
				bucket: effectiveBucket,
				text: effectiveText,
				source: "batch" as TermSenseSource,
				flaggedReason,
				createdAt: now,
			})
			.onConflictDoNothing()
			.toSQL();

		statements.push(c.env.DB.prepare(senseStmt.sql).bind(...senseStmt.params));
		termSenseCreatedCount++;

		// UPDATE candidate with materialization pointers
		const candStmt = db
			.update(candidate)
			.set({
				status: "accepted" as BatchStatus,
				materializedTermId: termId,
				materializedTermSenseId: termSenseId,
				updatedAt: now,
			})
			.where(eq(candidate.id, cand.id))
			.toSQL();

		statements.push(c.env.DB.prepare(candStmt.sql).bind(...candStmt.params));
	}

	// Update batch status
	const batchStmt = db
		.update(batch)
		.set({
			status: "accepted" as BatchStatus,
			updatedAt: now,
		})
		.where(eq(batch.id, batchId))
		.toSQL();

	statements.push(c.env.DB.prepare(batchStmt.sql).bind(...batchStmt.params));

	// Build summary for idempotency storage
	const summary: AcceptSummary = {
		batchId,
		status: "accepted",
		candidateCount,
		acceptedCount: termSenseCreatedCount,
		skippedAlreadyAcceptedCount,
		termCreatedCount,
		termSenseCreatedCount,
		flaggedCount,
	};

	// Insert idempotency key
	const resultRef = `accept_summary:${toBase64Url(JSON.stringify(summary))}`;
	const idempStmt = db
		.insert(idempotencyKey)
		.values({
			userId,
			scope: ACCEPT_ALL_SCOPE,
			key: clientRequestId,
			requestHash,
			resultRef,
			createdAt: now,
		})
		.toSQL();

	statements.push(c.env.DB.prepare(idempStmt.sql).bind(...idempStmt.params));

	// -------------------------------------------------------------------------
	// 9. Phase 3: Execute all statements atomically
	// -------------------------------------------------------------------------
	try {
		await c.env.DB.batch(statements);
	} catch (error) {
		// Handle race condition on idempotency key
		if (
			error instanceof Error &&
			error.message.includes("UNIQUE constraint failed")
		) {
			// Re-check idempotency key
			const racedKey = await db.query.idempotencyKey.findFirst({
				where: and(
					eq(idempotencyKey.userId, userId),
					eq(idempotencyKey.scope, ACCEPT_ALL_SCOPE),
					eq(idempotencyKey.key, clientRequestId)
				),
			});

			if (racedKey) {
				if (racedKey.requestHash === requestHash) {
					// Replay
					const resultRefMatch = racedKey.resultRef.match(
						/^accept_summary:(.+)$/
					);
					if (resultRefMatch) {
						try {
							const summaryJson = fromBase64Url(resultRefMatch[1]);
							const cachedSummary = JSON.parse(
								summaryJson
							) as AcceptSummary;
							return c.json(cachedSummary, 200);
						} catch {
							// Fall through to error
						}
					}
				} else {
					// Conflict
					const resultRefMatch = racedKey.resultRef.match(
						/^accept_summary:(.+)$/
					);
					let originalBatchId = "unknown";
					if (resultRefMatch) {
						try {
							const summaryJson = fromBase64Url(resultRefMatch[1]);
							const storedSummary = JSON.parse(
								summaryJson
							) as AcceptSummary;
							originalBatchId = storedSummary.batchId;
						} catch {
							// Fall through
						}
					}
					return apiError(
						c,
						409,
						"IDEMPOTENCY_CONFLICT",
						"clientRequestId was used for a different batch",
						{ originalBatchId }
					);
				}
			}
		}

		console.error("Accept-all error:", error);
		return apiError(c, 500, "INTERNAL_ERROR", "Failed to accept batch");
	}

	// -------------------------------------------------------------------------
	// 10. Return summary
	// -------------------------------------------------------------------------
	return c.json(summary, 200);
});

export { batchRoutes };
