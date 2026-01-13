DROP INDEX `event_user_emitted_idx`;--> statement-breakpoint
CREATE INDEX `event_user_emitted_device_event_idx` ON `event` (`user_id`,`emitted_at`,`device_id`,`event_id`);