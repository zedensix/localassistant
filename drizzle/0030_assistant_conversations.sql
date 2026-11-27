CREATE TABLE `assistant_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_conversation_user_idx` ON `assistant_conversation` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `assistant_message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`thinking` text,
	`actions` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_message_conversation_idx` ON `assistant_message` (`conversation_id`);