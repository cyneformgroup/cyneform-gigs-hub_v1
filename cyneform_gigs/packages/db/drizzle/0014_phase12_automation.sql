CREATE TABLE `account_deletions` (
	`user_id` char(36) NOT NULL,
	`requested_by` char(36) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`summary` text NOT NULL,
	`deleted_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`anonymize_after` datetime(3) NOT NULL,
	`anonymized_at` datetime(3),
	CONSTRAINT `account_deletions_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `data_requests` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`type` varchar(12) NOT NULL,
	`details` varchar(2000) NOT NULL,
	`status` varchar(12) NOT NULL DEFAULT 'open',
	`due_at` datetime(3) NOT NULL,
	`handled_by` char(36),
	`handled_at` datetime(3),
	`response` varchar(2000),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `data_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lifecycle_notices` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`kind` varchar(60) NOT NULL,
	`anchor` varchar(40) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `lifecycle_notices_id` PRIMARY KEY(`id`),
	CONSTRAINT `lifecycle_notice_uq` UNIQUE(`user_id`,`kind`,`anchor`)
);
--> statement-breakpoint
CREATE INDEX `data_request_status_idx` ON `data_requests` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `data_request_user_idx` ON `data_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `lifecycle_kind_idx` ON `lifecycle_notices` (`kind`,`created_at`);