ALTER TABLE `email_messages` ADD `review_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_messages` ADD `reviewed_at` integer;
--> statement-breakpoint
CREATE INDEX `email_messages_review_status_idx` ON `email_messages` (`review_status`,`sent_at`);
