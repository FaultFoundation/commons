ALTER TABLE `games` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `featured` integer DEFAULT false NOT NULL;