CREATE TABLE `export_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bucket_id` text,
	`bucket_slug` text NOT NULL,
	`bucket_name` text NOT NULL,
	`filename` text NOT NULL,
	`entry_count` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bucket_id`) REFERENCES `bucket`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `export_log_user_created_idx` ON `export_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `import_file` (
	`id` text PRIMARY KEY NOT NULL,
	`import_run_id` text NOT NULL,
	`filename` text NOT NULL,
	`r2_key` text NOT NULL,
	`size` integer NOT NULL,
	`bucket_id` text,
	`entries_imported` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`import_run_id`) REFERENCES `import_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bucket_id`) REFERENCES `bucket`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_file_run_idx` ON `import_file` (`import_run_id`);--> statement-breakpoint
CREATE TABLE `import_run` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`import_id` text NOT NULL,
	`status` text NOT NULL,
	`term_created_count` integer DEFAULT 0 NOT NULL,
	`term_sense_created_count` integer DEFAULT 0 NOT NULL,
	`flagged_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_run_status_check" CHECK("import_run"."status" IN ('pending', 'done', 'error'))
);
--> statement-breakpoint
CREATE INDEX `import_run_user_created_idx` ON `import_run` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_run_user_import_id_unique` ON `import_run` (`user_id`,`import_id`);