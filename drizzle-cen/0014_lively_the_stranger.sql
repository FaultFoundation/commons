CREATE TABLE `discord_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_key` text NOT NULL,
	`tournament_id` text NOT NULL,
	`source_channel_id` text NOT NULL,
	`data_json` text NOT NULL,
	`field_times_json` text NOT NULL,
	`locked_at` integer,
	`last_message_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discord_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`source_channel_id` text NOT NULL,
	`source_message_id` text NOT NULL,
	`source_guild_id` text,
	`forwarded_by` text NOT NULL,
	`posted_at` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	`capture_hash` text,
	`duplicate_of` text,
	`document_text` text,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`lease_until` integer NOT NULL,
	`error` text,
	`extraction_json` text,
	`target_override` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `ext_tournaments_source_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `ext_tournaments_source_unique` ON `ext_tournaments` (`source`,`source_tournament_id`,`game`);