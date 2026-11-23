CREATE TABLE `calcom_events` (
	`id` char(36) NOT NULL,
	`payload_hash` char(64) NOT NULL,
	`event_type` varchar(40) NOT NULL,
	`booking_uid` varchar(100),
	`received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `calcom_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `calcom_events_hash_uq` UNIQUE(`payload_hash`)
);
--> statement-breakpoint
CREATE TABLE `crm_entries` (
	`id` char(36) NOT NULL,
	`lead_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`client_name` varchar(255) NOT NULL,
	`event_description` text,
	`client_type` varchar(80),
	`decision_maker_name` varchar(255),
	`job_title` varchar(255),
	`contacts` text NOT NULL,
	`outreach_channels` text NOT NULL,
	`social_platforms` text NOT NULL,
	`outreach_notes` text,
	`statuses` text NOT NULL,
	`current_status` varchar(30) NOT NULL,
	`followup_1_date` datetime(3),
	`followup_2_date` datetime(3),
	`followup_3_date` datetime(3),
	`followup_1_notified_at` datetime(3),
	`followup_2_notified_at` datetime(3),
	`followup_3_notified_at` datetime(3),
	`is_completed` boolean NOT NULL DEFAULT false,
	`completed_at` datetime(3),
	`call_status` varchar(20),
	`call_starts_at` datetime(3),
	`cal_booking_uid` varchar(100),
	`won_at` datetime(3),
	`lost_at` datetime(3),
	`flagged_generic_at` datetime(3),
	`flagged_by` char(36),
	`flag_reason` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `crm_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_entries_lead_uq` UNIQUE(`lead_id`)
);
--> statement-breakpoint
CREATE TABLE `crm_files` (
	`id` char(36) NOT NULL,
	`entry_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`mime` varchar(100) NOT NULL,
	`size` int NOT NULL,
	`storage_key` varchar(255) NOT NULL,
	`sha256` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `crm_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `outreach_channels` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `outreach_notes` text;--> statement-breakpoint
CREATE INDEX `crm_entries_user_idx` ON `crm_entries` (`user_id`,`current_status`);--> statement-breakpoint
CREATE INDEX `crm_entries_cal_idx` ON `crm_entries` (`cal_booking_uid`);--> statement-breakpoint
CREATE INDEX `crm_files_entry_idx` ON `crm_files` (`entry_id`);