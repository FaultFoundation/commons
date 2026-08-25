CREATE TABLE `ext_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`source_match_id` text NOT NULL,
	`scheduled_at` integer,
	`state` text,
	`round` text,
	`entrant_1_name` text,
	`entrant_2_name` text,
	`url` text
);
--> statement-breakpoint
CREATE INDEX `ext_matches_event_idx` ON `ext_matches` (`event_id`);--> statement-breakpoint
CREATE INDEX `ext_matches_scheduled_at_idx` ON `ext_matches` (`scheduled_at`);