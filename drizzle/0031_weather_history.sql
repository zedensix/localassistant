CREATE TABLE `weather_day` (
	`home_id` text NOT NULL,
	`date` text NOT NULL,
	`min` real NOT NULL,
	`mean` real NOT NULL,
	`max` real NOT NULL,
	`code` integer NOT NULL,
	PRIMARY KEY(`home_id`, `date`),
	FOREIGN KEY (`home_id`) REFERENCES `home`(`id`) ON UPDATE no action ON DELETE cascade
);
