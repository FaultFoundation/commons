CREATE TABLE `pd_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_match_id` text NOT NULL,
	`game` text,
	`competition_name` text,
	`round_text` text,
	`team_external_id` text,
	`team_name` text,
	`opponent_team_id` text,
	`opponent_name` text,
	`score_for` integer,
	`score_against` integer,
	`result` text,
	`status` text DEFAULT 'finished' NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pd_matches_user_provider_match_unique` ON `pd_matches` (`user_id`,`provider`,`external_match_id`);--> statement-breakpoint
CREATE INDEX `pd_matches_user_started_idx` ON `pd_matches` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `pd_matches_team_started_idx` ON `pd_matches` (`provider`,`team_external_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `pd_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`handle` text,
	`meta` text,
	`poll_chunk` integer NOT NULL,
	`last_synced_at` integer,
	`backfill_cursor` text,
	`backfill_done` integer DEFAULT false NOT NULL,
	`status` text,
	`status_detail` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pd_sync_user_provider_unique` ON `pd_sync` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `pd_sync_chunk_idx` ON `pd_sync` (`poll_chunk`);--> statement-breakpoint
CREATE INDEX `pd_sync_last_synced_idx` ON `pd_sync` (`last_synced_at`);--> statement-breakpoint
CREATE TABLE `pd_team_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pd_team_links_user_idx` ON `pd_team_links` (`user_id`);--> statement-breakpoint
CREATE INDEX `pd_team_links_team_idx` ON `pd_team_links` (`team_id`);--> statement-breakpoint
CREATE TABLE `pd_team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`player_external_id` text,
	`handle` text,
	`role` text,
	`avatar_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pd_team_members_team_idx` ON `pd_team_members` (`team_id`);--> statement-breakpoint
CREATE TABLE `pd_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_team_id` text NOT NULL,
	`name` text NOT NULL,
	`game` text,
	`logo_url` text,
	`url` text,
	`roster_refreshed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pd_teams_provider_external_unique` ON `pd_teams` (`provider`,`external_team_id`);