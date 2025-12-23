CREATE TABLE `batch` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "batch_status_check" CHECK("batch"."status" IN ('captured', 'suggested', 'accepted'))
);
--> statement-breakpoint
CREATE INDEX `batch_user_id_idx` ON `batch` (`user_id`);--> statement-breakpoint
CREATE TABLE `candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`position` integer NOT NULL,
	`term` text NOT NULL,
	`normalized_term` text NOT NULL,
	`status` text NOT NULL,
	`chosen_bucket` text,
	`chosen_text` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batch`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "candidate_status_check" CHECK("candidate"."status" IN ('captured', 'suggested', 'accepted')),
	CONSTRAINT "candidate_chosen_bucket_check" CHECK("candidate"."chosen_bucket" IS NULL OR "candidate"."chosen_bucket" IN ('foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'))
);
--> statement-breakpoint
CREATE INDEX `candidate_batch_id_idx` ON `candidate` (`batch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_batch_position_unique` ON `candidate` (`batch_id`,`position`);--> statement-breakpoint
CREATE TABLE `idempotency_key` (
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`result_ref` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`expires_at` integer,
	PRIMARY KEY(`user_id`, `scope`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `term` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canonical` text NOT NULL,
	`display_term` text NOT NULL,
	`primary_sense_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `term_user_canonical_unique` ON `term` (`user_id`,`canonical`);--> statement-breakpoint
CREATE TABLE `term_sense` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`bucket` text NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`sense_label` text,
	`flagged_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`term_id`) REFERENCES `term`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "term_sense_bucket_check" CHECK("term_sense"."bucket" IN ('foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts')),
	CONSTRAINT "term_sense_source_check" CHECK("term_sense"."source" IN ('manual', 'batch', 'import'))
);
--> statement-breakpoint
CREATE INDEX `term_sense_term_created_idx` ON `term_sense` (`term_id`,`created_at`);