CREATE TABLE `points_rule_versions` (
	`id` char(36) NOT NULL,
	`version_no` int NOT NULL,
	`reason` varchar(500) NOT NULL,
	`changed_by` char(36),
	`snapshot` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `points_rule_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `points_rule_versions_no_uq` UNIQUE(`version_no`)
);
--> statement-breakpoint
CREATE TABLE `points_rules` (
	`key` varchar(50) NOT NULL,
	`scheme` varchar(20) NOT NULL,
	`points` decimal(10,2) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`verification_required` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `points_rules_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `points_schemes` (
	`key` varchar(20) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `points_schemes_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `points_vault` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`rule_key` varchar(50) NOT NULL,
	`points` decimal(10,2) NOT NULL,
	`cash_equivalent` decimal(12,2) NOT NULL,
	`status` varchar(24) NOT NULL,
	`lead_id` char(36),
	`crm_entry_id` char(36),
	`rule_version_no` int,
	`verification_required` boolean NOT NULL DEFAULT false,
	`earned_at` datetime(3) NOT NULL,
	`expires_at` datetime(3),
	`expired_at` datetime(3),
	`created_by` char(36),
	`note` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `points_vault_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `points_vault_user_status_idx` ON `points_vault` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `points_vault_dup_idx` ON `points_vault` (`user_id`,`rule_key`,`lead_id`,`earned_at`);--> statement-breakpoint
CREATE INDEX `points_vault_expiry_idx` ON `points_vault` (`expires_at`);