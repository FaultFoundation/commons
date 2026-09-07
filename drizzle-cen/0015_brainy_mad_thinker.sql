ALTER TABLE `discord_entities` ADD `series_key` text;--> statement-breakpoint
ALTER TABLE `discord_entities` ADD `is_league` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `discord_entities` ADD `published_at` integer;