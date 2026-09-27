CREATE TABLE `coupon_uses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`used_at` integer NOT NULL,
	`week_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gym_logs` (
	`date` text PRIMARY KEY NOT NULL,
	`check_in_at` integer,
	`check_out_at` integer,
	`verified_by` text
);
--> statement-breakpoint
CREATE TABLE `lock_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`released_by` text
);
--> statement-breakpoint
CREATE TABLE `meal_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`meal_index` integer NOT NULL,
	`deadline` text NOT NULL,
	`photo_uri` text,
	`barcode` text,
	`ai` text,
	`portion` real DEFAULT 1 NOT NULL,
	`shared_meal` integer DEFAULT false NOT NULL,
	`logged_at` integer,
	`status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_logs_date_index` ON `meal_logs` (`date`,`meal_index`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sleep_logs` (
	`date` text PRIMARY KEY NOT NULL,
	`locked_at` integer,
	`unlocked_at` integer
);
