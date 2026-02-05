CREATE TABLE `llm_budget` (
	`feature` text PRIMARY KEY NOT NULL,
	`window_start_ms` integer NOT NULL,
	`window_ms` integer NOT NULL,
	`shared_used_count` integer DEFAULT 0 NOT NULL,
	`shared_limit_count` integer NOT NULL,
	`reserved_used_count` integer DEFAULT 0 NOT NULL,
	`reserved_limit_count` integer NOT NULL,
	`disabled_until_ms` integer,
	`updated_at_ms` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_suggestion_quota` (
	`user_id` text PRIMARY KEY NOT NULL,
	`lifetime_used_count` integer DEFAULT 0 NOT NULL,
	`last_used_at_ms` integer,
	`created_at_ms` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at_ms` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
