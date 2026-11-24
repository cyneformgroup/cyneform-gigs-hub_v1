CREATE TABLE `phantom_equity_records` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`percentage` decimal(5,2) NOT NULL,
	`grant_date` datetime(3) NOT NULL,
	`cliff_date` datetime(3) NOT NULL,
	`baseline_valuation` decimal(14,2) NOT NULL,
	`vested_notified_pct` decimal(5,2) NOT NULL DEFAULT 0,
	`granted_by` char(36) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`overridden` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `phantom_equity_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `equity_user_uq` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `equity_milestones` (
	`id` char(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`valuation` decimal(14,2) NOT NULL,
	`reached_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`recorded_by` char(36) NOT NULL,
	`notes` varchar(500),
	CONSTRAINT `equity_milestones_id` PRIMARY KEY(`id`),
	CONSTRAINT `equity_milestone_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `equity_payouts` (
	`id` char(36) NOT NULL,
	`grant_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`milestone_id` char(36) NOT NULL,
	`vested_percent` decimal(5,2) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`status` varchar(12) NOT NULL DEFAULT 'pending',
	`paid_by` char(36),
	`paid_at` datetime(3),
	`payment_reference` varchar(100),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `equity_payouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `equity_payout_uq` UNIQUE(`grant_id`,`milestone_id`)
);
--> statement-breakpoint
CREATE TABLE `performance_bonus_records` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`contracts_closed` int NOT NULL,
	`window_start` datetime(3) NOT NULL,
	`window_end` datetime(3) NOT NULL,
	`rollover_snapshot` decimal(14,2) NOT NULL,
	`max_payout` decimal(14,2) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending_review',
	`amount` decimal(14,2),
	`decided_by` char(36),
	`decided_at` datetime(3),
	`decision_notes` varchar(500),
	`liquidated_at` datetime(3),
	`liquidated_amount` decimal(14,2),
	`paid_by` char(36),
	`paid_at` datetime(3),
	`payment_reference` varchar(100),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `performance_bonus_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `crm_entries` ADD `estimated_value` decimal(14,2);--> statement-breakpoint
ALTER TABLE `deal_compensation` ADD `client_paid_at` datetime(3);--> statement-breakpoint
CREATE INDEX `equity_payout_user_idx` ON `equity_payouts` (`user_id`);--> statement-breakpoint
CREATE INDEX `bonus_user_status_idx` ON `performance_bonus_records` (`user_id`,`status`);