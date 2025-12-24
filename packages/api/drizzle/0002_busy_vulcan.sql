CREATE TABLE `suggestion_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`normalized_term` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` integer NOT NULL,
	`suggested_bucket` text NOT NULL,
	`suggested_text` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "suggestion_cache_bucket_check" CHECK("suggestion_cache"."suggested_bucket" IN ('foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_cache_user_term_model_version_unique` ON `suggestion_cache` (`user_id`,`normalized_term`,`model`,`prompt_version`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`position` integer NOT NULL,
	`term` text NOT NULL,
	`normalized_term` text NOT NULL,
	`status` text NOT NULL,
	`chosen_bucket` text,
	`chosen_text` text,
	`version` integer DEFAULT 1 NOT NULL,
	`suggested_bucket` text,
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
	CONSTRAINT "candidate_status_check" CHECK("__new_candidate"."status" IN ('captured', 'suggested', 'accepted')),
	CONSTRAINT "candidate_chosen_bucket_check" CHECK("__new_candidate"."chosen_bucket" IS NULL OR "__new_candidate"."chosen_bucket" IN ('foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts')),
	CONSTRAINT "candidate_suggested_bucket_check" CHECK("__new_candidate"."suggested_bucket" IS NULL OR "__new_candidate"."suggested_bucket" IN ('foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts')),
	CONSTRAINT "candidate_suggestion_status_check" CHECK("__new_candidate"."suggestion_status" IS NULL OR "__new_candidate"."suggestion_status" IN ('in_progress', 'done', 'error'))
);
--> statement-breakpoint
INSERT INTO `__new_candidate`("id", "batch_id", "position", "term", "normalized_term", "status", "chosen_bucket", "chosen_text", "version", "suggested_bucket", "suggested_text", "suggestion_status", "suggestion_error", "suggestion_attempts", "suggestion_model", "suggestion_prompt_version", "suggestion_updated_at", "materialized_term_id", "materialized_term_sense_id", "created_at", "updated_at") SELECT "id", "batch_id", "position", "term", "normalized_term", "status", CASE WHEN "chosen_bucket" = 'null' THEN NULL ELSE "chosen_bucket" END, CASE WHEN "chosen_text" = 'null' THEN NULL ELSE "chosen_text" END, "version", NULL, NULL, NULL, NULL, 0, 'gpt-5-mini', 1, NULL, NULL, NULL, "created_at", "updated_at" FROM `candidate`;--> statement-breakpoint
DROP TABLE `candidate`;--> statement-breakpoint
ALTER TABLE `__new_candidate` RENAME TO `candidate`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `candidate_batch_id_idx` ON `candidate` (`batch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_batch_position_unique` ON `candidate` (`batch_id`,`position`);--> statement-breakpoint
CREATE INDEX `candidate_suggestion_lookup_idx` ON `candidate` (`batch_id`,`suggestion_status`,`suggestion_attempts`);