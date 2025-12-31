-- Migration: Custom Buckets (Phase 5B)
-- Creates bucket table and seeds default buckets for all existing users

-- Step 1: Create bucket table
CREATE TABLE `bucket` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`color` text,
	`order` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bucket_user_slug_unique` ON `bucket` (`user_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `bucket_user_order_idx` ON `bucket` (`user_id`,`order`);
--> statement-breakpoint

-- Step 2: Seed default buckets for all existing users
-- Using lower(hex(randomblob(16))) for UUID-like IDs
INSERT INTO `bucket` (`id`, `user_id`, `slug`, `name`, `description`, `order`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  u.id,
  'foundations',
  'Foundations',
  'Core CS concepts, algorithms, data structures',
  0,
  cast(unixepoch('subsec') * 1000 as integer),
  cast(unixepoch('subsec') * 1000 as integer)
FROM `user` u;
--> statement-breakpoint

INSERT INTO `bucket` (`id`, `user_id`, `slug`, `name`, `description`, `order`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  u.id,
  'backend',
  'Backend',
  'Server-side patterns, APIs, databases, storage',
  1,
  cast(unixepoch('subsec') * 1000 as integer),
  cast(unixepoch('subsec') * 1000 as integer)
FROM `user` u;
--> statement-breakpoint

INSERT INTO `bucket` (`id`, `user_id`, `slug`, `name`, `description`, `order`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  u.id,
  'frontend',
  'Frontend',
  'UI patterns, React, state management, conflict UX',
  2,
  cast(unixepoch('subsec') * 1000 as integer),
  cast(unixepoch('subsec') * 1000 as integer)
FROM `user` u;
--> statement-breakpoint

INSERT INTO `bucket` (`id`, `user_id`, `slug`, `name`, `description`, `order`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  u.id,
  'dx-tooling',
  'DX Tooling',
  'Build tools, migrations, scripts, CI/CD',
  3,
  cast(unixepoch('subsec') * 1000 as integer),
  cast(unixepoch('subsec') * 1000 as integer)
FROM `user` u;
--> statement-breakpoint

INSERT INTO `bucket` (`id`, `user_id`, `slug`, `name`, `description`, `order`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  u.id,
  'deep-concepts',
  'Deep Concepts',
  'System design, CAP theorem, architecture',
  4,
  cast(unixepoch('subsec') * 1000 as integer),
  cast(unixepoch('subsec') * 1000 as integer)
FROM `user` u;
--> statement-breakpoint

-- Step 3: Recreate candidate table with new bucket_id columns
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`position` integer NOT NULL,
	`term` text NOT NULL,
	`normalized_term` text NOT NULL,
	`status` text NOT NULL,
	`chosen_bucket` text,
	`chosen_bucket_id` text,
	`chosen_text` text,
	`version` integer DEFAULT 1 NOT NULL,
	`suggested_bucket` text,
	`suggested_bucket_id` text,
	`suggested_text` text,
	`suggestion_status` text,
	`suggestion_error` text,
	`suggestion_attempts` integer DEFAULT 0 NOT NULL,
	`suggestion_model` text DEFAULT 'gpt-5-mini' NOT NULL,
	`suggestion_prompt_version` integer DEFAULT 1 NOT NULL,
	`suggestion_updated_at` integer,
	`materialized_term_id` text,
	`materialized_term_sense_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batch`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chosen_bucket_id`) REFERENCES `bucket`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`suggested_bucket_id`) REFERENCES `bucket`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "candidate_status_check" CHECK("__new_candidate"."status" IN ('captured', 'suggested', 'accepted')),
	CONSTRAINT "candidate_suggestion_status_check" CHECK("__new_candidate"."suggestion_status" IS NULL OR "__new_candidate"."suggestion_status" IN ('in_progress', 'done', 'error'))
);
--> statement-breakpoint
INSERT INTO `__new_candidate`("id", "batch_id", "position", "term", "normalized_term", "status", "chosen_bucket", "chosen_bucket_id", "chosen_text", "version", "suggested_bucket", "suggested_bucket_id", "suggested_text", "suggestion_status", "suggestion_error", "suggestion_attempts", "suggestion_model", "suggestion_prompt_version", "suggestion_updated_at", "materialized_term_id", "materialized_term_sense_id", "created_at", "updated_at") SELECT "id", "batch_id", "position", "term", "normalized_term", "status", "chosen_bucket", NULL, "chosen_text", "version", "suggested_bucket", NULL, "suggested_text", "suggestion_status", "suggestion_error", "suggestion_attempts", "suggestion_model", "suggestion_prompt_version", "suggestion_updated_at", "materialized_term_id", "materialized_term_sense_id", "created_at", "updated_at" FROM `candidate`;
--> statement-breakpoint
DROP TABLE `candidate`;
--> statement-breakpoint
ALTER TABLE `__new_candidate` RENAME TO `candidate`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE INDEX `candidate_batch_id_idx` ON `candidate` (`batch_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_batch_position_unique` ON `candidate` (`batch_id`,`position`);
--> statement-breakpoint
CREATE INDEX `candidate_suggestion_lookup_idx` ON `candidate` (`batch_id`,`suggestion_status`,`suggestion_attempts`);
--> statement-breakpoint

-- Step 4: Populate candidate bucket_id columns from slug lookup via batch->user
UPDATE `candidate`
SET `chosen_bucket_id` = (
  SELECT b.id FROM `bucket` b
  JOIN `batch` ba ON ba.user_id = b.user_id
  WHERE ba.id = candidate.batch_id AND b.slug = candidate.chosen_bucket
)
WHERE `chosen_bucket` IS NOT NULL;
--> statement-breakpoint

UPDATE `candidate`
SET `suggested_bucket_id` = (
  SELECT b.id FROM `bucket` b
  JOIN `batch` ba ON ba.user_id = b.user_id
  WHERE ba.id = candidate.batch_id AND b.slug = candidate.suggested_bucket
)
WHERE `suggested_bucket` IS NOT NULL;
--> statement-breakpoint

-- Step 5: Recreate suggestion_cache table with new bucket_id column
CREATE TABLE `__new_suggestion_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`normalized_term` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` integer NOT NULL,
	`suggested_bucket` text NOT NULL,
	`suggested_bucket_id` text,
	`suggested_text` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suggested_bucket_id`) REFERENCES `bucket`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_suggestion_cache`("id", "user_id", "normalized_term", "model", "prompt_version", "suggested_bucket", "suggested_bucket_id", "suggested_text", "created_at", "updated_at") SELECT "id", "user_id", "normalized_term", "model", "prompt_version", "suggested_bucket", NULL, "suggested_text", "created_at", "updated_at" FROM `suggestion_cache`;
--> statement-breakpoint
DROP TABLE `suggestion_cache`;
--> statement-breakpoint
ALTER TABLE `__new_suggestion_cache` RENAME TO `suggestion_cache`;
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_cache_user_term_model_version_unique` ON `suggestion_cache` (`user_id`,`normalized_term`,`model`,`prompt_version`);
--> statement-breakpoint

-- Step 6: Populate suggestion_cache bucket_id from slug lookup
UPDATE `suggestion_cache`
SET `suggested_bucket_id` = (
  SELECT b.id FROM `bucket` b
  WHERE b.user_id = suggestion_cache.user_id AND b.slug = suggestion_cache.suggested_bucket
);
--> statement-breakpoint

-- Step 7: Recreate term_sense table with new bucket_id column
CREATE TABLE `__new_term_sense` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`bucket` text NOT NULL,
	`bucket_id` text,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`sense_label` text,
	`flagged_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`term_id`) REFERENCES `term`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bucket_id`) REFERENCES `bucket`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "term_sense_source_check" CHECK("__new_term_sense"."source" IN ('manual', 'batch', 'import'))
);
--> statement-breakpoint
INSERT INTO `__new_term_sense`("id", "term_id", "bucket", "bucket_id", "text", "source", "sense_label", "flagged_reason", "created_at", "archived_at") SELECT "id", "term_id", "bucket", NULL, "text", "source", "sense_label", "flagged_reason", "created_at", "archived_at" FROM `term_sense`;
--> statement-breakpoint
DROP TABLE `term_sense`;
--> statement-breakpoint
ALTER TABLE `__new_term_sense` RENAME TO `term_sense`;
--> statement-breakpoint
CREATE INDEX `term_sense_term_created_idx` ON `term_sense` (`term_id`,`created_at`);
--> statement-breakpoint

-- Step 8: Populate term_sense bucket_id from slug lookup via term->user
UPDATE `term_sense`
SET `bucket_id` = (
  SELECT b.id FROM `bucket` b
  JOIN `term` t ON t.user_id = b.user_id
  WHERE t.id = term_sense.term_id AND b.slug = term_sense.bucket
);
