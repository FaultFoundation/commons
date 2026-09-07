CREATE TABLE `discovery_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_follows_user_target_idx` ON `discovery_follows` (`user_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `discovery_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`identity` text NOT NULL,
	`organization_id` text NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_to` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discovery_identities_source_time_idx` ON `discovery_identities` (`identity`,`valid_from`);--> statement-breakpoint
CREATE TABLE `discovery_overrides` (
	`tournament_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `discovery_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`website` text,
	`owner_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `discovery_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`data` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`previous_data` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `discovery_submissions_status_idx` ON `discovery_submissions` (`status`,`created_at`);