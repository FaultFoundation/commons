CREATE TABLE `parental_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`consented_at` integer,
	`consent_ip` text,
	`expires_at` integer NOT NULL,
	`send_count` integer DEFAULT 1 NOT NULL,
	`last_sent_at` integer NOT NULL,
	`first_sent_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parental_consents_user_id_unique` ON `parental_consents` (`user_id`);--> statement-breakpoint
CREATE INDEX `parental_consents_token_hash_idx` ON `parental_consents` (`token_hash`);