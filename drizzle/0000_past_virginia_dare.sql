CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `colleges` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text,
	`alpha_two_code` text,
	`state_province` text,
	`primary_domain` text,
	`domains` text,
	`web_pages` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_primary_domain_unique` ON `colleges` (`primary_domain`);--> statement-breakpoint
CREATE TABLE `collegiate_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`membership_id` text NOT NULL,
	`college_id` text,
	`user_type` text,
	`school_email` text,
	`graduation_date` text,
	`referrer` text,
	`circumstances` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`membership_id`) REFERENCES `program_memberships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`college_id`) REFERENCES `colleges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collegiate_registrations_membership_id_unique` ON `collegiate_registrations` (`membership_id`);--> statement-breakpoint
CREATE INDEX `collegiate_registrations_school_email_idx` ON `collegiate_registrations` (`school_email`);--> statement-breakpoint
CREATE INDEX `collegiate_registrations_college_id_idx` ON `collegiate_registrations` (`college_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE TABLE `match_games` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`game_number` integer NOT NULL,
	`map_name` text,
	`mode` text,
	`participant_a_score` integer DEFAULT 0 NOT NULL,
	`participant_b_score` integer DEFAULT 0 NOT NULL,
	`winner_participant_id` text,
	`replay_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`winner_participant_id`) REFERENCES `tournament_participants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `match_games_match_id_idx` ON `match_games` (`match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_games_match_game_unique` ON `match_games` (`match_id`,`game_number`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`stage_id` text,
	`round` integer,
	`bracket` text,
	`participant_a_id` text,
	`participant_b_id` text,
	`winner_participant_id` text,
	`best_of` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`scheduled_at` integer,
	`played_at` integer,
	`next_match_id` text,
	`next_match_slot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`participant_a_id`) REFERENCES `tournament_participants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`participant_b_id`) REFERENCES `tournament_participants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`winner_participant_id`) REFERENCES `tournament_participants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`next_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `matches_tournament_id_idx` ON `matches` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`program_id` text,
	`action` text NOT NULL,
	`reason` text,
	`notes` text,
	`subject_discord_id` text,
	`subject_email` text,
	`actor_user_id` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moderation_actions_user_id_idx` ON `moderation_actions` (`user_id`);--> statement-breakpoint
CREATE INDEX `moderation_actions_subject_discord_id_idx` ON `moderation_actions` (`subject_discord_id`);--> statement-breakpoint
CREATE TABLE `platform_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text,
	`handle` text,
	`verified` integer DEFAULT false NOT NULL,
	`connected_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `platform_identities_user_id_idx` ON `platform_identities` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_identities_user_provider_unique` ON `platform_identities` (`user_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_identities_provider_external_unique` ON `platform_identities` (`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`country` text,
	`age_range` text,
	`dm_preference` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_user_id_unique` ON `profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `program_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`program_id` text NOT NULL,
	`status` text,
	`joined_at` integer NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_memberships_user_program_unique` ON `program_memberships` (`user_id`,`program_id`);--> statement-breakpoint
CREATE INDEX `program_memberships_program_status_idx` ON `program_memberships` (`program_id`,`status`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`game_id` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `programs_slug_unique` ON `programs` (`slug`);--> statement-breakpoint
CREATE TABLE `school_email_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`send_count` integer DEFAULT 1 NOT NULL,
	`last_sent_at` integer NOT NULL,
	`first_sent_at` integer NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_email_verifications_user_id_unique` ON `school_email_verifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `school_email_verifications_email_idx` ON `school_email_verifications` (`email`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text NOT NULL,
	`alpha_two_code` text NOT NULL,
	`state_province` text,
	`domains` text NOT NULL,
	`web_pages` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schools_country_name_idx` ON `schools` (`country`,`name`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `staff_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`program_id` text,
	`granted_by` text,
	`granted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `staff_roles_user_id_idx` ON `staff_roles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_roles_user_role_program_unique` ON `staff_roles` (`user_id`,`role`,`program_id`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'round_robin' NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stages_tournament_id_idx` ON `stages` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`position` text,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_members_team_id_idx` ON `team_members` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_members_user_id_idx` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_team_user_unique` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`game_id` text,
	`college_id` text,
	`name` text NOT NULL,
	`tag` text,
	`captain_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`college_id`) REFERENCES `colleges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`captain_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `teams_program_id_idx` ON `teams` (`program_id`);--> statement-breakpoint
CREATE INDEX `teams_college_id_idx` ON `teams` (`college_id`);--> statement-breakpoint
CREATE TABLE `tournament_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text,
	`user_id` text,
	`seed` integer,
	`checked_in_at` integer,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`map_diff` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`final_standing` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tournament_participants_team_xor_user" CHECK(("tournament_participants"."team_id" IS NOT NULL) <> ("tournament_participants"."user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `tournament_participants_tournament_id_idx` ON `tournament_participants` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`game_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`format` text DEFAULT 'round_robin' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`best_of` integer DEFAULT 3 NOT NULL,
	`custom_game_code` text,
	`starts_at` integer,
	`ends_at` integer,
	`rules_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_slug_unique` ON `tournaments` (`slug`);--> statement-breakpoint
CREATE INDEX `tournaments_program_id_idx` ON `tournaments` (`program_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);