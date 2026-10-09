ALTER TABLE `lock_events` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `meal_logs` ADD `share_friends` integer DEFAULT false NOT NULL;