CREATE TABLE `leave_requests` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`reason` text NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`decided_by` char(36),
	`decided_at` datetime(3),
	`decision_note` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `leave_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_status_history` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`from_status` varchar(20),
	`to_status` varchar(20) NOT NULL,
	`reason` text NOT NULL,
	`changed_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `deactivation_type` varchar(12);--> statement-breakpoint
ALTER TABLE `users` ADD `deactivated_at` datetime(3);--> statement-breakpoint
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_decided_by_users_id_fk` FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_status_history` ADD CONSTRAINT `user_status_history_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_status_history` ADD CONSTRAINT `user_status_history_changed_by_users_id_fk` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_leave_user` ON `leave_requests` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_leave_status` ON `leave_requests` (`status`,`start_date`);--> statement-breakpoint
CREATE INDEX `ix_status_history_user` ON `user_status_history` (`user_id`,`created_at`);