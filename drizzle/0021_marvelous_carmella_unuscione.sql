CREATE TABLE `team_provider_links` (
	`external_team_id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`linked_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `team_provider_links_team_idx` ON `team_provider_links` (`team_id`);