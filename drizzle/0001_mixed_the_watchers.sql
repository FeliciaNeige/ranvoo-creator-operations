ALTER TABLE `email_messages` ADD `folder_name` text;--> statement-breakpoint
ALTER TABLE `mail_sync_state` ADD `folder_index` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mail_sync_state` ADD `folder_id` text;--> statement-breakpoint
ALTER TABLE `mail_sync_state` ADD `folder_name` text;--> statement-breakpoint
ALTER TABLE `mail_sync_state` ADD `folders_total` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mail_sync_state` ADD `folders_completed` integer DEFAULT 0 NOT NULL;