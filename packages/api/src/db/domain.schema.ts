import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';

// =============================================================================
// Enums (stable slugs, enforced via CHECK constraints)
// =============================================================================

/** Batch/candidate lifecycle status */
export const BATCH_STATUS = ['captured', 'suggested', 'accepted'] as const;
export type BatchStatus = (typeof BATCH_STATUS)[number];

/** Suggestion generation status */
export const SUGGESTION_STATUS = ['in_progress', 'done', 'error'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUS)[number];

/** Term sense source */
export const TERM_SENSE_SOURCE = ['manual', 'batch', 'import'] as const;
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
	return term.trim().toLowerCase().replace(/\s+/g, ' ');
}

// =============================================================================
// Tables
// =============================================================================

/**
 * Bucket: user-owned vocabulary categories.
 * Users can create, edit, delete, and reorder buckets.
 */
export const bucket = sqliteTable(
	'bucket',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		color: text('color'),
		order: integer('order').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex('bucket_user_slug_unique').on(table.userId, table.slug),
		index('bucket_user_order_idx').on(table.userId, table.order),
	]
);

/**
 * Batch: a collection of candidate terms from a single capture session.
 */
export const batch = sqliteTable(
	'batch',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: text('status').notNull().$type<BatchStatus>(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index('batch_user_id_idx').on(table.userId),
		check('batch_status_check', sql`${table.status} IN ('captured', 'suggested', 'accepted')`),
	]
);

/**
 * Candidate: an individual term captured in a batch, pending review.
 */
export const candidate = sqliteTable(
	'candidate',
	{
		id: text('id').primaryKey(),
		batchId: text('batch_id')
			.notNull()
			.references(() => batch.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		term: text('term').notNull(),
		normalizedTerm: text('normalized_term').notNull(),
		status: text('status').notNull().$type<BatchStatus>(),
		// Step 4+ fields
		// Legacy: chosenBucket (slug string) - coexists with chosenBucketId during migration
		chosenBucket: text('chosen_bucket'),
		// New: chosenBucketId (FK to bucket table)
		chosenBucketId: text('chosen_bucket_id').references(() => bucket.id, { onDelete: 'set null' }),
		chosenText: text('chosen_text'),
		version: integer('version').default(1).notNull(),
		// Step 3: Suggestion fields
		// Legacy: suggestedBucket (slug string) - coexists with suggestedBucketId during migration
		suggestedBucket: text('suggested_bucket'),
		// New: suggestedBucketId (FK to bucket table)
		suggestedBucketId: text('suggested_bucket_id').references(() => bucket.id, { onDelete: 'set null' }),
		suggestedText: text('suggested_text'),
		suggestionStatus: text('suggestion_status').$type<SuggestionStatus>(),
		suggestionError: text('suggestion_error'),
		suggestionAttempts: integer('suggestion_attempts').default(0).notNull(),
		suggestionModel: text('suggestion_model').default('gpt-5-mini').notNull(),
		suggestionPromptVersion: integer('suggestion_prompt_version').default(1).notNull(),
		suggestionUpdatedAt: integer('suggestion_updated_at', {
			mode: 'timestamp_ms',
		}),
		// Step 5: Materialization pointers
		materializedTermId: text('materialized_term_id'),
		materializedTermSenseId: text('materialized_term_sense_id'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index('candidate_batch_id_idx').on(table.batchId),
		uniqueIndex('candidate_batch_position_unique').on(table.batchId, table.position),
		index('candidate_suggestion_lookup_idx').on(table.batchId, table.suggestionStatus, table.suggestionAttempts),
		check('candidate_status_check', sql`${table.status} IN ('captured', 'suggested', 'accepted')`),
		check(
			'candidate_suggestion_status_check',
			sql`${table.suggestionStatus} IS NULL OR ${table.suggestionStatus} IN ('in_progress', 'done', 'error')`
		),
	]
);

/**
 * Term: a user's vocabulary entry (canonical representation).
 * Not used by Step 2 API, but created now to avoid schema churn.
 */
export const term = sqliteTable(
	'term',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		canonical: text('canonical').notNull(),
		displayTerm: text('display_term').notNull(),
		primarySenseId: text('primary_sense_id'), // nullable, no FK for now
		version: integer('version').default(1).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
	},
	(table) => [uniqueIndex('term_user_canonical_unique').on(table.userId, table.canonical)]
);

/**
 * TermSense: a meaning/definition of a term in a specific bucket.
 * Not used by Step 2 API, but created now to avoid schema churn.
 */
export const termSense = sqliteTable(
	'term_sense',
	{
		id: text('id').primaryKey(),
		termId: text('term_id')
			.notNull()
			.references(() => term.id, { onDelete: 'cascade' }),
		// Legacy: bucket (slug string) - coexists with bucketId during migration
		bucket: text('bucket').notNull(),
		// New: bucketId (FK to bucket table) - will become NOT NULL after migration
		bucketId: text('bucket_id').references(() => bucket.id, { onDelete: 'restrict' }),
		text: text('text').notNull(),
		source: text('source').notNull().$type<TermSenseSource>(),
		senseLabel: text('sense_label'),
		flaggedReason: text('flagged_reason'),
		version: integer('version').default(1).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
	},
	(table) => [
		index('term_sense_term_created_idx').on(table.termId, table.createdAt),
		check('term_sense_source_check', sql`${table.source} IN ('manual', 'batch', 'import')`),
	]
);

/**
 * IdempotencyKey: tracks idempotent API requests to enable safe retries.
 * PK is (user_id, scope, key) per docs/design.md.
 */
export const idempotencyKey = sqliteTable(
	'idempotency_key',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		scope: text('scope').notNull(),
		key: text('key').notNull(),
		requestHash: text('request_hash').notNull(),
		resultRef: text('result_ref').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }), // nullable; expiry not enforced in Step 2
	},
	(table) => [primaryKey({ columns: [table.userId, table.scope, table.key] })]
);

/**
 * SuggestionCache: per-user, per-normalized-term cache for AI suggestions.
 * Used to avoid redundant LLM calls for the same term.
 */
export const suggestionCache = sqliteTable(
	'suggestion_cache',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		normalizedTerm: text('normalized_term').notNull(),
		model: text('model').notNull(),
		promptVersion: integer('prompt_version').notNull(),
		// Legacy: suggestedBucket (slug string) - coexists with suggestedBucketId during migration
		suggestedBucket: text('suggested_bucket').notNull(),
		// New: suggestedBucketId (FK to bucket table) - will become NOT NULL after migration
		suggestedBucketId: text('suggested_bucket_id').references(() => bucket.id, { onDelete: 'cascade' }),
		suggestedText: text('suggested_text').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex('suggestion_cache_user_term_model_version_unique').on(table.userId, table.normalizedTerm, table.model, table.promptVersion),
	]
);

// =============================================================================
// Import/Export History Tables
// =============================================================================

/** Import run status */
export const IMPORT_RUN_STATUS = ['pending', 'done', 'error'] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUS)[number];

/**
 * ImportRun: tracks a complete import session.
 * Created when files are uploaded, updated when import is committed.
 */
export const importRun = sqliteTable(
	'import_run',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		importId: text('import_id').notNull(), // Client-provided or generated import ID (matches R2 prefix)
		status: text('status').notNull().$type<ImportRunStatus>(),
		termCreatedCount: integer('term_created_count').default(0).notNull(),
		termSenseCreatedCount: integer('term_sense_created_count').default(0).notNull(),
		flaggedCount: integer('flagged_count').default(0).notNull(),
		skippedCount: integer('skipped_count').default(0).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
	},
	(table) => [
		index('import_run_user_created_idx').on(table.userId, table.createdAt),
		uniqueIndex('import_run_user_import_id_unique').on(table.userId, table.importId),
		check('import_run_status_check', sql`${table.status} IN ('pending', 'done', 'error')`),
	]
);

/**
 * ImportFile: tracks each file within an import run.
 */
export const importFile = sqliteTable(
	'import_file',
	{
		id: text('id').primaryKey(),
		importRunId: text('import_run_id')
			.notNull()
			.references(() => importRun.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		r2Key: text('r2_key').notNull(),
		size: integer('size').notNull(), // File size in bytes
		bucketId: text('bucket_id').references(() => bucket.id, { onDelete: 'set null' }), // Target bucket (null if unmapped)
		entriesImported: integer('entries_imported').default(0).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
	},
	(table) => [index('import_file_run_idx').on(table.importRunId)]
);

/**
 * ExportLog: tracks each export operation.
 */
export const exportLog = sqliteTable(
	'export_log',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		bucketId: text('bucket_id').references(() => bucket.id, { onDelete: 'set null' }),
		bucketSlug: text('bucket_slug').notNull(), // Preserved even if bucket deleted
		bucketName: text('bucket_name').notNull(), // Preserved even if bucket renamed
		filename: text('filename').notNull(),
		entryCount: integer('entry_count').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
	},
	(table) => [index('export_log_user_created_idx').on(table.userId, table.createdAt)]
);
