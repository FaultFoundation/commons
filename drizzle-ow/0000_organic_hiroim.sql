CREATE TABLE `ow_players` (
	`user_id` text PRIMARY KEY NOT NULL,
	`battletag` text NOT NULL,
	`player_id` text NOT NULL,
	`platform` text DEFAULT 'pc' NOT NULL,
	`visibility` text,
	`visibility_checked_at` integer,
	`poll_chunk` integer NOT NULL,
	`last_snapshot_at` integer,
	`first_connected_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ow_players_chunk_idx` ON `ow_players` (`poll_chunk`);--> statement-breakpoint
CREATE INDEX `ow_players_last_snapshot_idx` ON `ow_players` (`last_snapshot_at`);--> statement-breakpoint
CREATE TABLE `ow_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`captured_at` integer NOT NULL,
	`battletag` text,
	`player_id` text,
	`platform` text,
	`endorsement_level` integer,
	`title` text,
	`avatar_url` text,
	`namecard_url` text,
	`comp_season` integer,
	`tank_division` text,
	`tank_tier` integer,
	`damage_division` text,
	`damage_tier` integer,
	`support_division` text,
	`support_tier` integer,
	`open_division` text,
	`open_tier` integer,
	`games_played` integer,
	`games_won` integer,
	`games_lost` integer,
	`time_played` integer,
	`winrate` real,
	`kda` real,
	`total_eliminations` integer,
	`total_assists` integer,
	`total_deaths` integer,
	`total_damage` integer,
	`total_healing` integer,
	`avg_eliminations` real,
	`avg_assists` real,
	`avg_deaths` real,
	`avg_damage` real,
	`avg_healing` real,
	`summary_json` text,
	`stats_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ow_snapshots_user_captured_idx` ON `ow_snapshots` (`user_id`,`captured_at`);