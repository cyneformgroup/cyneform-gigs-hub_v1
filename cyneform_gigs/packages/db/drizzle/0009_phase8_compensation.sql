CREATE TABLE `compensation_profiles` (
	`user_id` char(36) NOT NULL,
	`elite` boolean NOT NULL DEFAULT false,
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `compensation_profiles_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `deal_compensation` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`crm_entry_id` char(36) NOT NULL,
	`lead_id` char(36) NOT NULL,
	`deal_name` varchar(255) NOT NULL,
	`deal_value` decimal(14,2) NOT NULL,
	`closed_at` datetime(3) NOT NULL,
	`month` char(7) NOT NULL,
	`cumulative_before` decimal(14,2) NOT NULL,
	`cumulative_after` decimal(14,2) NOT NULL,
	`tier` int NOT NULL,
	`commission_rate` decimal(5,2) NOT NULL,
	`commission_amount` decimal(14,2) NOT NULL,
	`kes_per_point` decimal(14,2) NOT NULL,
	`points_used` decimal(10,2) NOT NULL,
	`points_value` decimal(14,2) NOT NULL,
	`rollover_applied` decimal(14,2) NOT NULL,
	`total_before_cap` decimal(14,2) NOT NULL,
	`cap_phase` int NOT NULL,
	`cap_rate` decimal(5,2) NOT NULL,
	`cap_amount` decimal(14,2) NOT NULL,
	`final_payout` decimal(14,2) NOT NULL,
	`rollover_created` decimal(14,2) NOT NULL,
	`client_payment_status` varchar(12) NOT NULL,
	`payment_status` varchar(12) NOT NULL DEFAULT 'pending',
	`approved_by` char(36),
	`approved_at` datetime(3),
	`paid_by` char(36),
	`paid_at` datetime(3),
	`payment_reference` varchar(100),
	`payment_note` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `deal_compensation_id` PRIMARY KEY(`id`),
	CONSTRAINT `deal_comp_entry_uq` UNIQUE(`crm_entry_id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_revenue_tracking` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`month` char(7) NOT NULL,
	`cumulative_revenue` decimal(14,2) NOT NULL,
	`deals_closed` int NOT NULL DEFAULT 0,
	`tier_applied` int NOT NULL,
	`effective_rate` decimal(5,2) NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `monthly_revenue_tracking_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_rev_user_month_uq` UNIQUE(`user_id`,`month`)
);
--> statement-breakpoint
CREATE TABLE `rollover_tracking` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`source_deal_id` char(36) NOT NULL,
	`rollover_amount` decimal(14,2) NOT NULL,
	`remaining_balance` decimal(14,2) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`status` varchar(12) NOT NULL DEFAULT 'active',
	`applied_in_deal_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `rollover_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `crm_entries` ADD `closed_project` text;--> statement-breakpoint
ALTER TABLE `points_vault` ADD `used_in_deal_id` char(36);--> statement-breakpoint
CREATE INDEX `deal_comp_user_idx` ON `deal_compensation` (`user_id`,`payment_status`);--> statement-breakpoint
CREATE INDEX `rollover_user_idx` ON `rollover_tracking` (`user_id`,`status`,`expires_at`);