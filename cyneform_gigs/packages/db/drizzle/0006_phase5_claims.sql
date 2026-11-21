CREATE TABLE `lead_claims` (
	`lead_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`claim_time` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `lead_claims_lead_id` PRIMARY KEY(`lead_id`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `claimed_by` char(36);--> statement-breakpoint
ALTER TABLE `leads` ADD `claimed_at` datetime(3);--> statement-breakpoint
ALTER TABLE `leads` ADD `outreach_sent_at` datetime(3);--> statement-breakpoint
CREATE INDEX `lead_claims_user_idx` ON `lead_claims` (`user_id`);--> statement-breakpoint
CREATE INDEX `lead_claims_expiry_idx` ON `lead_claims` (`expires_at`);