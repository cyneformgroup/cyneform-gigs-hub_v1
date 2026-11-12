CREATE TABLE `email_logs` (
	`id` char(36) NOT NULL,
	`recipient` varchar(255) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`template` varchar(50),
	`status` varchar(10) NOT NULL,
	`attempt` int NOT NULL,
	`error` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`type` varchar(40) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` varchar(1000),
	`link` varchar(255),
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings_history` (
	`id` char(36) NOT NULL,
	`setting_key` varchar(100) NOT NULL,
	`old_value` text,
	`new_value` text NOT NULL,
	`reason` varchar(500) NOT NULL,
	`changed_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `settings_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`setting_key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `system_settings_setting_key` PRIMARY KEY(`setting_key`)
);
--> statement-breakpoint
CREATE INDEX `email_logs_created_idx` ON `email_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `settings_history_key_idx` ON `settings_history` (`setting_key`,`created_at`);