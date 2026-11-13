CREATE TABLE `harvest_run_errors` (
	`id` char(36) NOT NULL,
	`run_id` char(36) NOT NULL,
	`url` varchar(500),
	`stage` varchar(20) NOT NULL,
	`message` varchar(500) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `harvest_run_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `harvest_runs` (
	`id` char(36) NOT NULL,
	`source_id` char(36) NOT NULL,
	`trigger_type` varchar(10) NOT NULL,
	`status` varchar(10) NOT NULL,
	`started_by` char(36),
	`started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`finished_at` datetime(3),
	`pages` int NOT NULL DEFAULT 0,
	`found` int NOT NULL DEFAULT 0,
	`added` int NOT NULL DEFAULT 0,
	`duplicates` int NOT NULL DEFAULT 0,
	`rejected` int NOT NULL DEFAULT 0,
	`error_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `harvest_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_sources` (
	`id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`start_urls` text NOT NULL,
	`strategy` varchar(12) NOT NULL,
	`config` text NOT NULL,
	`filters` text NOT NULL,
	`category` varchar(60),
	`max_pages` int,
	`schedule` varchar(60),
	`enabled` boolean NOT NULL DEFAULT true,
	`auto_publish` boolean NOT NULL DEFAULT false,
	`health` varchar(12) NOT NULL DEFAULT 'unknown',
	`last_run_at` datetime(3),
	`tos_checked_at` datetime(3),
	`tos_note` varchar(500),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `lead_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` char(36) NOT NULL,
	`source_id` char(36),
	`run_id` char(36),
	`title` varchar(255) NOT NULL,
	`description` text,
	`client_name` varchar(255),
	`venue` varchar(255),
	`location` varchar(255),
	`category` varchar(60),
	`budget` decimal(12,2),
	`currency` char(3),
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3),
	`event_url` varchar(500) NOT NULL,
	`fingerprint` char(64) NOT NULL,
	`contacts` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending_review',
	`published_at` datetime(3),
	`reviewed_by` char(36),
	`reviewed_at` datetime(3),
	`reject_reason` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `leads_fingerprint_unique` UNIQUE(`fingerprint`)
);
--> statement-breakpoint
CREATE INDEX `harvest_errors_run_idx` ON `harvest_run_errors` (`run_id`);--> statement-breakpoint
CREATE INDEX `harvest_runs_source_idx` ON `harvest_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `leads_event_url_idx` ON `leads` (`event_url`);--> statement-breakpoint
CREATE INDEX `leads_source_idx` ON `leads` (`source_id`);