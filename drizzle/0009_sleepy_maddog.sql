CREATE TABLE `support_ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_type` text NOT NULL,
	`author_user_id` text,
	`author_discord_id` text,
	`author_name` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`attachments` text,
	`source` text NOT NULL,
	`discord_message_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `support_ticket_messages_ticket_idx` ON `support_ticket_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `support_ticket_messages_discord_msg_unique` ON `support_ticket_messages` (`discord_message_id`);--> statement-breakpoint
CREATE TABLE `support_ticket_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_user_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `support_ticket_notes_ticket_idx` ON `support_ticket_notes` (`ticket_id`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_number` integer NOT NULL,
	`user_id` text,
	`discord_user_id` text,
	`discord_username` text,
	`discord_channel_id` text,
	`discord_channel_name` text,
	`category` text,
	`subject` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text,
	`assigned_to_user_id` text,
	`close_reason` text,
	`closed_by_user_id` text,
	`warning_sent` integer DEFAULT false NOT NULL,
	`last_activity_at` integer NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_tickets_number_unique` ON `support_tickets` (`ticket_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `support_tickets_channel_unique` ON `support_tickets` (`discord_channel_id`);--> statement-breakpoint
CREATE INDEX `support_tickets_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE INDEX `support_tickets_assigned_idx` ON `support_tickets` (`assigned_to_user_id`);--> statement-breakpoint
CREATE INDEX `support_tickets_discord_user_idx` ON `support_tickets` (`discord_user_id`);