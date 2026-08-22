CREATE TABLE `tournament_brackets` (
	`tournament_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `match_games`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
DROP TABLE `stages`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`game_id` text,
	`source` text DEFAULT 'challonge' NOT NULL,
	`external_id` text,
	`external_url` text,
	`name` text NOT NULL,
	`format` text DEFAULT 'single_elim' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`max_participants` integer,
	`starts_at` integer,
	`ends_at` integer,
	`registration_opens_at` integer,
	`registration_closes_at` integer,
	`roster_lock_at` integer,
	`best_of` integer DEFAULT 3 NOT NULL,
	`swiss_rounds` integer,
	`third_place_match` integer DEFAULT false NOT NULL,
	`rules_url` text,
	`version` integer DEFAULT 0 NOT NULL,
	`bracket_generated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tournaments`("id", "program_id", "game_id", "source", "external_id", "external_url", "name", "format", "status", "max_participants", "starts_at", "ends_at", "registration_opens_at", "registration_closes_at", "roster_lock_at", "best_of", "swiss_rounds", "third_place_match", "rules_url", "version", "bracket_generated_at", "created_at", "updated_at") SELECT "id", "program_id", "game_id", "source", "external_id", "external_url", "name", "format", "status", "max_participants", "starts_at", "ends_at", "registration_opens_at", "registration_closes_at", "roster_lock_at", "best_of", "swiss_rounds", "third_place_match", "rules_url", "version", "bracket_generated_at", "created_at", "updated_at" FROM `tournaments`;--> statement-breakpoint
DROP TABLE `tournaments`;--> statement-breakpoint
ALTER TABLE `__new_tournaments` RENAME TO `tournaments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tournaments_program_id_idx` ON `tournaments` (`program_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_source_external_unique` ON `tournaments` (`source`,`external_id`);--> statement-breakpoint
ALTER TABLE `tournament_participants` ADD `challonge_participant_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_participants_tournament_team_unique` ON `tournament_participants` (`tournament_id`,`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_participants_tournament_user_unique` ON `tournament_participants` (`tournament_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `tournament_participants` DROP COLUMN `wins`;--> statement-breakpoint
ALTER TABLE `tournament_participants` DROP COLUMN `losses`;--> statement-breakpoint
ALTER TABLE `tournament_participants` DROP COLUMN `map_diff`;--> statement-breakpoint
ALTER TABLE `tournament_participants` DROP COLUMN `points`;--> statement-breakpoint
ALTER TABLE `tournament_participants` DROP COLUMN `final_standing`;