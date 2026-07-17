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
ALTER TABLE `profiles` ADD `age_range` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `country` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `school_email` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `referrer` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `circumstances` text;