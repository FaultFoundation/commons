CREATE TABLE `lfg_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text,
	`profile_id` text,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`direction` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`message` text,
	`responded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `team_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `lfg_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lfg_connections_team_status_idx` ON `lfg_connections` (`team_id`,`status`);--> statement-breakpoint
CREATE INDEX `lfg_connections_user_status_idx` ON `lfg_connections` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `lfg_connections_listing_user_unique` ON `lfg_connections` (`listing_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `lfg_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`game_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`skill_rating` integer,
	`peak_rating` integer,
	`positions` text,
	`availability` text,
	`timezone` text,
	`region` text,
	`description` text,
	`contact_preference` text,
	`bumped_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lfg_profiles_user_program_game_unique` ON `lfg_profiles` (`user_id`,`program_id`,`game_id`);--> statement-breakpoint
CREATE INDEX `lfg_profiles_program_status_idx` ON `lfg_profiles` (`program_id`,`status`);--> statement-breakpoint
CREATE TABLE `team_delete_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`requested_by_user_id` text,
	`reason` text,
	`status` text DEFAULT 'open' NOT NULL,
	`expires_at` integer,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `team_delete_requests_team_id_idx` ON `team_delete_requests` (`team_id`);--> statement-breakpoint
CREATE TABLE `team_delete_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`decision` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `team_delete_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_delete_votes_request_id_idx` ON `team_delete_votes` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_delete_votes_request_user_unique` ON `team_delete_votes` (`request_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`token` text NOT NULL,
	`kind` text DEFAULT 'link' NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`note` text,
	`created_by_user_id` text,
	`max_uses` integer,
	`use_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_token_unique` ON `team_invites` (`token`);--> statement-breakpoint
CREATE INDEX `team_invites_team_id_idx` ON `team_invites` (`team_id`);--> statement-breakpoint
CREATE TABLE `team_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`created_by_user_id` text,
	`program_id` text NOT NULL,
	`game_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`positions` text,
	`skill_min` integer,
	`skill_max` integer,
	`slots_open` integer,
	`availability` text,
	`timezone` text,
	`region` text,
	`description` text,
	`contact_url` text,
	`expires_at` integer,
	`bumped_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `team_listings_team_id_idx` ON `team_listings` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_listings_program_status_idx` ON `team_listings` (`program_id`,`status`);--> statement-breakpoint
--> SQLite can't ADD a NOT NULL column without a default; the literal 0 only
--> backfills pre-existing rows (there are none) — Drizzle always supplies it.
ALTER TABLE `match_games` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `reported_by_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `matches` ADD `reported_at` integer;--> statement-breakpoint
ALTER TABLE `teams` ADD `description` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `region` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `discord_invite_url` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `created_by_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `teams` ADD `disbanded_at` integer;--> statement-breakpoint
ALTER TABLE `tournament_participants` ADD `registered_by_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `tournament_participants` ADD `withdrawn_at` integer;