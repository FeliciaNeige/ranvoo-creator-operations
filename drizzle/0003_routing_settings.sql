CREATE TABLE IF NOT EXISTS `routing_settings` (
	`setting_key` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
