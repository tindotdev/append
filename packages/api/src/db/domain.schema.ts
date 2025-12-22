import { sql } from "drizzle-orm";
import {
	sqliteTable,
	text,
	integer,
	index,
	uniqueIndex,
	primaryKey,
	check,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema";

// =============================================================================
// Enums (stable slugs, enforced via CHECK constraints)
// =============================================================================

/** Batch/candidate lifecycle status */
export const BATCH_STATUS = ["captured", "suggested", "accepted"] as const;
export type BatchStatus = (typeof BATCH_STATUS)[number];

/** Knowledge domain buckets */
export const BUCKET = [
	"foundations",
	"backend",
	"frontend",
	"dx-tooling",
	"deep-concepts",
] as const;
export type Bucket = (typeof BUCKET)[number];

/** Term sense source */
export const TERM_SENSE_SOURCE = ["manual", "batch", "import"] as const;
export type TermSenseSource = (typeof TERM_SENSE_SOURCE)[number];

// =============================================================================
// Normalization function
// =============================================================================

/**
 * Normalize a term for comparison/deduplication.
 * - trim leading/trailing whitespace
 * - lowercase
 * - collapse internal whitespace to single space
 */
export function normalize(term: string): string {
	return term.trim().toLowerCase().replace(/\s+/g, " ");
}

// =============================================================================
// Tables
// =============================================================================

/**
 * Batch: a collection of candidate terms from a single capture session.
 */
export const batch = sqliteTable(
	"batch",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: text("status").notNull().$type<BatchStatus>(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("batch_user_id_idx").on(table.userId),
		check(
			"batch_status_check",
			sql`${table.status} IN ('captured', 'suggested', 'accepted')`
		),
	]
);

/**
 * Candidate: an individual term captured in a batch, pending review.
 */
export const candidate = sqliteTable(
	"candidate",
	{
		id: text("id").primaryKey(),
		batchId: text("batch_id")
			.notNull()
			.references(() => batch.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		term: text("term").notNull(),
		normalizedTerm: text("normalized_term").notNull(),
		status: text("status").notNull().$type<BatchStatus>(),
		// Step 4+ fields (nullable for now)
		chosenBucket: text("chosen_bucket").$type<Bucket>(),
		chosenText: text("chosen_text"),
		version: integer("version").default(1).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("candidate_batch_id_idx").on(table.batchId),
		uniqueIndex("candidate_batch_position_unique").on(
			table.batchId,
			table.position
		),
		check(
			"candidate_status_check",
			sql`${table.status} IN ('captured', 'suggested', 'accepted')`
		),
		check(
			"candidate_chosen_bucket_check",
			sql`${table.chosenBucket} IS NULL OR ${table.chosenBucket} IN ('foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts')`
		),
	]
);

/**
 * Term: a user's vocabulary entry (canonical representation).
 * Not used by Step 2 API, but created now to avoid schema churn.
 */
export const term = sqliteTable(
	"term",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		canonical: text("canonical").notNull(),
		displayTerm: text("display_term").notNull(),
		primarySenseId: text("primary_sense_id"), // nullable, no FK for now
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.notNull(),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("term_user_canonical_unique").on(table.userId, table.canonical),
	]
);

/**
 * TermSense: a meaning/definition of a term in a specific bucket.
 * Not used by Step 2 API, but created now to avoid schema churn.
 */
export const termSense = sqliteTable(
	"term_sense",
	{
		id: text("id").primaryKey(),
		termId: text("term_id")
			.notNull()
			.references(() => term.id, { onDelete: "cascade" }),
		bucket: text("bucket").notNull().$type<Bucket>(),
		text: text("text").notNull(),
		source: text("source").notNull().$type<TermSenseSource>(),
		senseLabel: text("sense_label"),
		flaggedReason: text("flagged_reason"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.notNull(),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("term_sense_term_created_idx").on(table.termId, table.createdAt),
		check(
			"term_sense_bucket_check",
			sql`${table.bucket} IN ('foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts')`
		),
		check(
			"term_sense_source_check",
			sql`${table.source} IN ('manual', 'batch', 'import')`
		),
	]
);

/**
 * IdempotencyKey: tracks idempotent API requests to enable safe retries.
 * PK is (user_id, scope, key) per docs/design.md.
 */
export const idempotencyKey = sqliteTable(
	"idempotency_key",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		scope: text("scope").notNull(),
		key: text("key").notNull(),
		requestHash: text("request_hash").notNull(),
		resultRef: text("result_ref").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }), // nullable; expiry not enforced in Step 2
	},
	(table) => [primaryKey({ columns: [table.userId, table.scope, table.key] })]
);
