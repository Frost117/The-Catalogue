CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`user_id` text NOT NULL,
	`author_display_name` text NOT NULL,
	`rating` integer NOT NULL CHECK (`rating` BETWEEN 1 AND 5),
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`display_name` text NOT NULL,
	`umbraco_member_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);