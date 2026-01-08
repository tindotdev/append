CREATE TABLE `device_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_token_hash_unique` ON `device_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `device_token_user_created_idx` ON `device_token` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `device_token_user_revoked_idx` ON `device_token` (`user_id`,`revoked_at`);

