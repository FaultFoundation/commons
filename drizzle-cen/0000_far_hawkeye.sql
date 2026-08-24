CREATE TABLE `ext_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`source_event_id` text NOT NULL,
	`name` text,
	`state` text,
	`num_entrants` integer
);
--> statement-breakpoint
CREATE INDEX `ext_events_tournament_idx` ON `ext_events` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `ext_standings` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`entrant_name` text NOT NULL,
	`is_team` integer DEFAULT true NOT NULL,
	`placement` integer
);
--> statement-breakpoint
CREATE INDEX `ext_standings_event_idx` ON `ext_standings` (`event_id`);--> statement-breakpoint
CREATE TABLE `ext_tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`game` text,
	`start_at` integer,
	`end_at` integer,
	`num_attendees` integer,
	`city` text,
	`country` text,
	`url` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `ext_tournaments_start_at_idx` ON `ext_tournaments` (`start_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ext_tournaments_source_unique` ON `ext_tournaments` (`source`,`source_tournament_id`);