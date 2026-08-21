CREATE TABLE `external_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tournament_id` text,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`opponent_name` text,
	`round` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`scheduled_at` integer,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `external_matches_user_scheduled_idx` ON `external_matches` (`user_id`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_matches_user_provider_external_unique` ON `external_matches` (`user_id`,`provider`,`external_id`);--> statement-breakpoint
ALTER TABLE `platform_identities` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `source` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `external_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_source_external_unique` ON `tournaments` (`source`,`external_id`);