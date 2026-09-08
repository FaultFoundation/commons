CREATE TABLE `tournament_list_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`built_at` integer NOT NULL,
	`lease_until` integer
);
