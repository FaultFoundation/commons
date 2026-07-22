--> Dropping `captain_user_id` needs the table rebuilt: SQLite refuses DROP
--> COLUMN on a column named in a FOREIGN KEY clause. Drizzle emits
--> `PRAGMA foreign_keys=OFF/ON` around the swap, but D1 rejects that pragma
--> (foreign keys are always on there) — `defer_foreign_keys` is its documented
--> substitute, and it resets itself when the migration's transaction commits.
PRAGMA defer_foreign_keys=on;--> statement-breakpoint
CREATE TABLE `__new_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`game_id` text,
	`college_id` text,
	`name` text NOT NULL,
	`tag` text,
	`description` text,
	`region` text,
	`timezone` text,
	`discord_invite_url` text,
	`created_by_user_id` text,
	`disbanded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`college_id`) REFERENCES `colleges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_teams`("id", "program_id", "game_id", "college_id", "name", "tag", "description", "region", "timezone", "discord_invite_url", "created_by_user_id", "disbanded_at", "created_at", "updated_at") SELECT "id", "program_id", "game_id", "college_id", "name", "tag", "description", "region", "timezone", "discord_invite_url", "created_by_user_id", "disbanded_at", "created_at", "updated_at" FROM `teams`;--> statement-breakpoint
DROP TABLE `teams`;--> statement-breakpoint
ALTER TABLE `__new_teams` RENAME TO `teams`;--> statement-breakpoint
CREATE INDEX `teams_program_id_idx` ON `teams` (`program_id`);--> statement-breakpoint
CREATE INDEX `teams_college_id_idx` ON `teams` (`college_id`);