CREATE TABLE `email_messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`folder_id` text,
	`subject` text DEFAULT '（无主题）' NOT NULL,
	`sender_name` text,
	`sender_email` text,
	`recipients_json` text DEFAULT '[]' NOT NULL,
	`sent_at` integer,
	`snippet` text,
	`body_text` text,
	`body_html` text,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`direction` text DEFAULT 'unknown' NOT NULL,
	`raw_json` text,
	`imported_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_sync_state` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`page_token` text,
	`total_imported` integer DEFAULT 0 NOT NULL,
	`last_synced_at` integer,
	`status` text DEFAULT 'idle' NOT NULL,
	`last_error` text
);
