CREATE TABLE `signup_form_items` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`label` text,
	`help` text,
	`required` integer DEFAULT true NOT NULL,
	`config` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `signup_forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `signup_form_items_form_idx` ON `signup_form_items` (`form_id`,`position`);--> statement-breakpoint
CREATE TABLE `signup_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`host_name` text,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`closes_at` integer,
	`event_url` text,
	`event_platform` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `signup_forms_owner_idx` ON `signup_forms` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `signup_response_values` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`item_id` text NOT NULL,
	`value` text,
	`met` integer,
	FOREIGN KEY (`response_id`) REFERENCES `signup_responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `signup_form_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signup_response_values_response_item_unique` ON `signup_response_values` (`response_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `signup_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `signup_forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signup_responses_form_user_unique` ON `signup_responses` (`form_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `signup_responses_user_idx` ON `signup_responses` (`user_id`);