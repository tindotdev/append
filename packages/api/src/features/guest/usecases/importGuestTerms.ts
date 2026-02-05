import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { bucket, type schema, term } from '../../../db';
import { generateUUID, sha256Hex } from '../../../shared/crypto';
import { checkIdempotencyKey, createIdempotencyKeyStatement, findIdempotencyKey } from '../../../shared/idempotency/keys';
import { decodeJsonResultRef, encodeJsonResultRef } from '../../../shared/idempotency/result-ref';
import type { ImportGuestTermsInput } from '../validation/importGuestTerms.schema';

const IDEMPOTENCY_SCOPE = 'guest_import_terms' as const;

export type ImportGuestTermsError =
	| { type: 'idempotency_conflict'; message: string }
	| { type: 'invalid_bucket'; message: string; slug: string }
	| { type: 'internal_error'; message: string };

export type ImportGuestTermsResult = {
	importedCount: number;
	createdTermCount: number;
	createdSenseCount: number;
	skippedExistingCount: number;
};

type ImportGuestTermsResponse =
	| { success: true; result: ImportGuestTermsResult; isReplay: boolean }
	| { success: false; error: ImportGuestTermsError };

function stableRequestString(input: ImportGuestTermsInput): string {
	// Preserve client order; this is only used for conflict detection (same key, different payload).
	return input.items.map((i) => `${i.term}\n${i.definition}\n${i.bucketSlug}\n${i.createdAtMs}\n${i.clientTermId}`).join('\n---\n');
}

type BucketRow = { slug: string; id: string };
async function fetchBucketSlugToId(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	slugs: string[]
): Promise<{ success: true; bucketSlugToId: Map<string, string> } | { success: false; error: ImportGuestTermsError }> {
	if (slugs.length === 0) return { success: true, bucketSlugToId: new Map() };

	const bucketRows: BucketRow[] = await db
		.select({ slug: bucket.slug, id: bucket.id })
		.from(bucket)
		.where(
			and(
				eq(bucket.userId, userId),
				sql`${bucket.slug} IN (${sql.join(
					slugs.map((s) => sql`${s}`),
					sql`, `
				)})`
			)
		);

	const bucketSlugToId = new Map(bucketRows.map((b) => [b.slug, b.id]));
	for (const slug of slugs) {
		if (!bucketSlugToId.has(slug)) {
			return { success: false, error: { type: 'invalid_bucket', slug, message: `Invalid bucket: '${slug}' does not exist` } };
		}
	}

	return { success: true, bucketSlugToId };
}

type ExistingTermRow = { id: string; canonical: string };
async function fetchExistingCanonicalSet(db: DrizzleD1Database<typeof schema>, userId: string, canonicals: string[]): Promise<Set<string>> {
	if (canonicals.length === 0) return new Set();

	const existingTerms: ExistingTermRow[] = await db
		.select({ id: term.id, canonical: term.canonical })
		.from(term)
		.where(
			and(
				eq(term.userId, userId),
				sql`${term.canonical} IN (${sql.join(
					canonicals.map((c) => sql`${c}`),
					sql`, `
				)})`
			)
		);

	return new Set(existingTerms.map((t) => t.canonical));
}

function buildImportStatements(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	input: ImportGuestTermsInput,
	bucketSlugToId: Map<string, string>,
	existingCanonicalSet: Set<string>
): { success: true; statements: D1PreparedStatement[]; result: ImportGuestTermsResult } | { success: false; error: ImportGuestTermsError } {
	const statements: D1PreparedStatement[] = [];
	let createdTermCount = 0;
	let createdSenseCount = 0;
	let skippedExistingCount = 0;

	for (const item of input.items) {
		if (existingCanonicalSet.has(item.canonical)) {
			skippedExistingCount += 1;
			continue;
		}

		// Prevent duplicates within the same request from attempting to create the same term twice.
		// This also ensures our counters don't over-report due to in-request duplicates.
		existingCanonicalSet.add(item.canonical);

		const termId = generateUUID();
		const senseId = generateUUID();
		const createdAt = new Date(item.createdAtMs);
		const bucketId = bucketSlugToId.get(item.bucketSlug);
		if (!bucketId) {
			return { success: false, error: { type: 'internal_error', message: `Missing bucket id for slug '${item.bucketSlug}'` } };
		}

		const termStmt = db
			.insert(term)
			.values({
				id: termId,
				userId,
				canonical: item.canonical,
				displayTerm: item.term,
				primarySenseId: senseId,
				createdAt,
			})
			.onConflictDoNothing()
			.toSQL();
		statements.push(rawDb.prepare(termStmt.sql).bind(...termStmt.params));

		// If the term insert is skipped due to a (userId, canonical) uniqueness conflict, `termId` won't exist.
		// Make the sense insert conditional on the generated `termId` existing to avoid FK failures.
		//
		// This handles both:
		// - duplicate canonicals within a request (second insert conflicts and is skipped)
		// - concurrent races (another request inserts the term between pre-query and insert)
		statements.push(
			rawDb
				.prepare(
					`
					INSERT INTO "term_sense" ("id", "term_id", "bucket", "bucket_id", "text", "source", "created_at")
					SELECT ?, ?, ?, ?, ?, 'import', ?
					WHERE EXISTS (SELECT 1 FROM "term" WHERE "id" = ?)
				`
				)
				.bind(senseId, termId, item.bucketSlug, bucketId, item.definition, createdAt.getTime(), termId)
		);

		createdTermCount += 1;
		createdSenseCount += 1;
	}

	return {
		success: true,
		statements,
		result: {
			importedCount: input.items.length,
			createdTermCount,
			createdSenseCount,
			skippedExistingCount,
		},
	};
}

function isUniqueConstraintError(error: unknown): boolean {
	return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

async function resolveIdempotencyRace(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	clientRequestId: string,
	requestHash: string
): Promise<ImportGuestTermsResponse | null> {
	const racedKey = await findIdempotencyKey(db, userId, IDEMPOTENCY_SCOPE, clientRequestId);
	if (!racedKey) return null;

	if (racedKey.requestHash !== requestHash) {
		return {
			success: false,
			error: { type: 'idempotency_conflict', message: 'clientRequestId was used with different request body' },
		};
	}

	const decoded = decodeJsonResultRef<ImportGuestTermsResult>('guest_import_terms', racedKey.resultRef);
	if (!decoded) return null;

	return { success: true, result: decoded, isReplay: true };
}

async function executeBatch(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	input: ImportGuestTermsInput,
	requestHash: string,
	now: Date,
	statements: D1PreparedStatement[],
	result: ImportGuestTermsResult
): Promise<ImportGuestTermsResponse> {
	const resultRef = encodeJsonResultRef('guest_import_terms', result);
	const idemStmt = createIdempotencyKeyStatement(db, userId, IDEMPOTENCY_SCOPE, input.clientRequestId, requestHash, resultRef, {
		createdAt: now,
		expiresAt: null,
	}).toSQL();
	statements.push(rawDb.prepare(idemStmt.sql).bind(...idemStmt.params));

	try {
		await rawDb.batch(statements);
		return { success: true, result, isReplay: false };
	} catch (error) {
		// Handle race condition: idempotency key insert can fail due to PK conflict.
		if (isUniqueConstraintError(error)) {
			const raced = await resolveIdempotencyRace(db, userId, input.clientRequestId, requestHash);
			if (raced) return raced;
		}

		console.error('[importGuestTerms] Import failed', {
			userId,
			clientRequestId: input.clientRequestId,
			itemCount: input.items.length,
			error,
		});
		return { success: false, error: { type: 'internal_error', message: 'Import failed' } };
	}
}

export async function importGuestTerms(
	db: DrizzleD1Database<typeof schema>,
	rawDb: D1Database,
	userId: string,
	input: ImportGuestTermsInput
): Promise<ImportGuestTermsResponse> {
	const requestHash = await sha256Hex(stableRequestString(input));

	const idem = await checkIdempotencyKey(db, userId, IDEMPOTENCY_SCOPE, input.clientRequestId, requestHash);
	if (idem.status === 'replay') {
		const decoded = decodeJsonResultRef<ImportGuestTermsResult>('guest_import_terms', idem.resultRef);
		if (!decoded) {
			return { success: false, error: { type: 'internal_error', message: 'Invalid idempotency result reference' } };
		}
		return { success: true, result: decoded, isReplay: true };
	}

	if (idem.status === 'conflict') {
		return { success: false, error: { type: 'idempotency_conflict', message: 'clientRequestId was used with different request body' } };
	}

	const uniqueBucketSlugs = [...new Set(input.items.map((i) => i.bucketSlug))];
	const buckets = await fetchBucketSlugToId(db, userId, uniqueBucketSlugs);
	if (!buckets.success) return buckets;

	const uniqueCanonicals = [...new Set(input.items.map((i) => i.canonical))];
	const existingCanonicalSet = await fetchExistingCanonicalSet(db, userId, uniqueCanonicals);

	const now = new Date();
	const built = buildImportStatements(db, rawDb, userId, input, buckets.bucketSlugToId, existingCanonicalSet);
	if (!built.success) return built;
	const { statements, result } = built;
	return executeBatch(db, rawDb, userId, input, requestHash, now, statements, result);
}
