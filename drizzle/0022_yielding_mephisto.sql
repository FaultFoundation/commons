CREATE TABLE `match_time_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`match_key` text NOT NULL,
	`revision` integer NOT NULL,
	`scheduled_at` integer NOT NULL,
	`source_url` text NOT NULL,
	`team_id` text,
	`submitted_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_time_reports_revision_unique` ON `match_time_reports` (`match_key`,`revision`);