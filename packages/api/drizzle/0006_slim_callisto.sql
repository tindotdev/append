CREATE TABLE `device` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'unknown' NOT NULL,
	`installed_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_seen_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_user_last_seen_idx` ON `device` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `event` (
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`event_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`type` text NOT NULL,
	`emitted_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`artifact_host` text,
	`artifact_url_hash` text,
	`artifact_path_hint` text,
	`title_hint` text,
	`payload_json` text NOT NULL,
	PRIMARY KEY(`user_id`, `device_id`, `event_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `device`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_user_emitted_idx` ON `event` (`user_id`,`emitted_at`);--> statement-breakpoint
CREATE INDEX `event_user_artifact_emitted_idx` ON `event` (`user_id`,`artifact_url_hash`,`emitted_at`);