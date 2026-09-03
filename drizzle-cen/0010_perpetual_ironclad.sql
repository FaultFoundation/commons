CREATE TABLE `school_favicons` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`domain` text NOT NULL,
	`favicon_url` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `school_favicons_normalized_name_idx` ON `school_favicons` (`normalized_name`);--> statement-breakpoint
ALTER TABLE `ext_matches` ADD `entrant_1_logo_url` text;--> statement-breakpoint
ALTER TABLE `ext_matches` ADD `entrant_2_logo_url` text;--> statement-breakpoint
ALTER TABLE `ext_standings` ADD `entrant_logo_url` text;