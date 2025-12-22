import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import worker from "../src/index";
import { schema, batch, candidate, idempotencyKey, user } from "../src/db";
import { applyMigrations } from "./setup";

// =============================================================================
// Test utilities
// =============================================================================

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/**
 * Sign up and sign in a test user, returning the session cookie.
 */
async function getAuthCookie(
	email: string = "test-a@example.com",
	password: string = "test-password-123"
): Promise<string> {
	// Sign up (idempotent - ignore if already exists)
	const signUpRes = await SELF.fetch("https://example.com/auth/sign-up/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email, password, name: "Test User" }),
	});

	// Only throw for non-"already exists" errors
	if (!signUpRes.ok) {
		const body = await signUpRes.text();
		if (!body.includes("already exists") && !body.includes("USER_ALREADY_EXISTS")) {
			throw new Error(`Sign-up failed: ${body}`);
		}
	}

	// Sign in
	const signInRes = await SELF.fetch("https://example.com/auth/sign-in/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email, password }),
	});

	if (!signInRes.ok) {
		const body = await signInRes.text();
		throw new Error(`Sign-in failed: ${body}`);
	}

	const setCookie = signInRes.headers.get("set-cookie");
	if (!setCookie) {
		throw new Error("No set-cookie header from sign-in");
	}

	return setCookie;
}

/**
 * Generate N lines of test terms.
 */
function generateTerms(count: number): string {
	return Array.from({ length: count }, (_, i) => `term-${i + 1}`).join("\n");
}

/**
 * Generate a valid UUID v4.
 */
function generateUUID(): string {
	return crypto.randomUUID();
}

// =============================================================================
// Setup
// =============================================================================

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	// Apply migrations to test database (§5.1)
	await applyMigrations();

	db = drizzle(env.DB, { schema });
	authCookie = await getAuthCookie();
});

afterEach(async () => {
	// Clean up test data after each test
	await db.delete(idempotencyKey);
	await db.delete(candidate);
	await db.delete(batch);
});

// =============================================================================
// POST /api/batch tests
// =============================================================================

describe("POST /api/batch", () => {
	it("returns 401 when unauthenticated", async () => {
		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe("UNAUTHORIZED");
	});

	it("returns 400 for missing clientRequestId", async () => {
		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({ terms: generateTerms(25) }),
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(body.error.message).toContain("clientRequestId");
	});

	it("returns 400 for invalid clientRequestId (not UUID)", async () => {
		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: "not-a-uuid",
			}),
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(body.error.message).toContain("UUID");
	});

	it("returns 400 for empty terms", async () => {
		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: "",
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe("VALIDATION_ERROR");
	});

	it("returns 400 for fewer than 20 terms", async () => {
		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(19),
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(body.error.message).toContain("20");
	});

	it("returns 400 for more than 200 terms", async () => {
		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(201),
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(body.error.message).toContain("200");
	});

	it("returns 400 for term line exceeding max length", async () => {
		const longTerm = "a".repeat(201);
		const terms = [longTerm, ...Array.from({ length: 24 }, (_, i) => `term-${i}`)].join(
			"\n"
		);

		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe("VALIDATION_ERROR");
		expect(body.error.message).toContain("200 characters");
	});

	it("returns 413 for payload too large", async () => {
		// Create a payload > 64 KiB
		const largePayload = "x".repeat(65 * 1024);

		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: largePayload,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(413);
		const body = await res.json();
		expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
	});

	it("creates batch + candidates with 201 status", async () => {
		const terms = generateTerms(25);
		const clientRequestId = generateUUID();

		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({ terms, clientRequestId }),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.id).toBeDefined();
		expect(body.candidateCount).toBe(25);

		// Verify batch in database
		const batchRow = await db.query.batch.findFirst({
			where: eq(batch.id, body.id),
		});
		expect(batchRow).toBeDefined();
		expect(batchRow?.status).toBe("captured");

		// Verify candidates in database
		const candidates = await db.query.candidate.findMany({
			where: eq(candidate.batchId, body.id),
		});
		expect(candidates.length).toBe(25);
	});

	it("replays with same clientRequestId + same terms (200)", async () => {
		const terms = generateTerms(25);
		const clientRequestId = generateUUID();

		// First request - creates
		const res1 = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({ terms, clientRequestId }),
		});

		expect(res1.status).toBe(201);
		const body1 = await res1.json();

		// Second request - replays
		const res2 = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({ terms, clientRequestId }),
		});

		expect(res2.status).toBe(200);
		const body2 = await res2.json();
		expect(body2.id).toBe(body1.id);
		expect(body2.candidateCount).toBe(body1.candidateCount);
	});

	it("returns 409 for same clientRequestId + different terms", async () => {
		const clientRequestId = generateUUID();

		// First request
		const res1 = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId,
			}),
		});

		expect(res1.status).toBe(201);

		// Second request with different terms
		const res2 = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(30), // Different terms
				clientRequestId,
			}),
		});

		expect(res2.status).toBe(409);
		const body = await res2.json();
		expect(body.error.code).toBe("IDEMPOTENCY_CONFLICT");
	});

	it("normalizes terms correctly", async () => {
		const terms = [
			"  Hello   World  ", // Should normalize to "hello world"
			"UPPERCASE",         // Should normalize to "uppercase"
			"  multiple   spaces  ", // Should normalize to "multiple spaces"
			...Array.from({ length: 22 }, (_, i) => `term-${i}`),
		].join("\n");

		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();

		// Verify normalization in database
		const candidates = await db.query.candidate.findMany({
			where: eq(candidate.batchId, body.id),
			orderBy: (candidate, { asc }) => [asc(candidate.position)],
		});

		expect(candidates[0].term).toBe("Hello   World");
		expect(candidates[0].normalizedTerm).toBe("hello world");

		expect(candidates[1].term).toBe("UPPERCASE");
		expect(candidates[1].normalizedTerm).toBe("uppercase");

		expect(candidates[2].term).toBe("multiple   spaces");
		expect(candidates[2].normalizedTerm).toBe("multiple spaces");
	});

	it("preserves duplicates as distinct candidates", async () => {
		const terms = [
			"duplicate-term",
			"duplicate-term",
			"duplicate-term",
			...Array.from({ length: 22 }, (_, i) => `unique-term-${i}`),
		].join("\n");

		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms,
				clientRequestId: generateUUID(),
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.candidateCount).toBe(25);

		// Verify all duplicates are preserved
		const candidates = await db.query.candidate.findMany({
			where: eq(candidate.batchId, body.id),
		});
		const duplicates = candidates.filter((c) => c.term === "duplicate-term");
		expect(duplicates.length).toBe(3);
	});
});

// =============================================================================
// GET /api/batch/:id tests
// =============================================================================

describe("GET /api/batch/:id", () => {
	it("returns 401 when unauthenticated", async () => {
		const res = await SELF.fetch("https://example.com/api/batch/some-id");
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe("UNAUTHORIZED");
	});

	it("returns 404 for non-existent batch", async () => {
		const res = await SELF.fetch(
			`https://example.com/api/batch/${generateUUID()}`,
			{
				headers: { cookie: authCookie },
			}
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe("NOT_FOUND");
	});

	it("returns 403 for non-owner", async () => {
		// Seed a "foreign" user + batch + candidate directly via Drizzle (§5.1)
		// This bypasses the allowlist check since we're writing directly to DB
		const foreignUserId = generateUUID();
		const foreignBatchId = generateUUID();
		const foreignCandidateId = generateUUID();
		const now = new Date();

		// Create foreign user
		await db.insert(user).values({
			id: foreignUserId,
			name: "Foreign User",
			email: "foreign@example.com",
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		});

		// Create foreign batch
		await db.insert(batch).values({
			id: foreignBatchId,
			userId: foreignUserId,
			status: "captured",
			createdAt: now,
			updatedAt: now,
		});

		// Create foreign candidate
		await db.insert(candidate).values({
			id: foreignCandidateId,
			batchId: foreignBatchId,
			position: 0,
			term: "foreign-term",
			normalizedTerm: "foreign-term",
			status: "captured",
			createdAt: now,
			updatedAt: now,
		});

		// Try to access the foreign user's batch as the authenticated test user
		const res = await SELF.fetch(`https://example.com/api/batch/${foreignBatchId}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error.code).toBe("FORBIDDEN");

		// Clean up foreign user data
		await db.delete(candidate).where(eq(candidate.id, foreignCandidateId));
		await db.delete(batch).where(eq(batch.id, foreignBatchId));
		await db.delete(user).where(eq(user.id, foreignUserId));
	});

	it("returns 200 with batch details for owner", async () => {
		// Create a batch
		const createRes = await SELF.fetch("https://example.com/api/batch", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie: authCookie,
			},
			body: JSON.stringify({
				terms: generateTerms(25),
				clientRequestId: generateUUID(),
			}),
		});

		expect(createRes.status).toBe(201);
		const { id: batchId } = await createRes.json();

		// Get the batch
		const res = await SELF.fetch(`https://example.com/api/batch/${batchId}`, {
			headers: { cookie: authCookie },
		});

		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.id).toBe(batchId);
		expect(body.status).toBe("captured");
		expect(body.candidateCount).toBe(25);
		expect(body.candidates).toHaveLength(25);
		expect(body.createdAt).toBeTypeOf("number");
		expect(body.updatedAt).toBeTypeOf("number");

		// Verify candidates are ordered by position
		for (let i = 0; i < body.candidates.length; i++) {
			expect(body.candidates[i].position).toBe(i);
			expect(body.candidates[i].term).toBe(`term-${i + 1}`);
		}
	});
});

// =============================================================================
// OPTIONS preflight tests
// =============================================================================

describe("OPTIONS preflight", () => {
	it("returns 204 without auth for /api/* routes", async () => {
		const res = await SELF.fetch("https://example.com/api/batch", {
			method: "OPTIONS",
		});

		expect(res.status).toBe(204);
	});
});
