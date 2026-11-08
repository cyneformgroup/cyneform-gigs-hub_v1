CREATE TABLE `auth_sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`family_id` char(36) NOT NULL,
	`refresh_token_hash` varbinary(32) NOT NULL,
	`previous_token_hash` varbinary(32),
	`ip_address` varchar(45),
	`user_agent` varchar(255),
	`device_label` varchar(100),
	`last_active_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`revoke_reason` varchar(40),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sessions_refresh` UNIQUE(`refresh_token_hash`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`email_bidx` varbinary(32) NOT NULL,
	`outcome` varchar(30) NOT NULL,
	`ip_address` varchar(45),
	`user_agent` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `one_time_links` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`purpose` enum('set_password','reset_password') NOT NULL,
	`token_hash` varbinary(32) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `one_time_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_links_token` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `otp_challenges` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`otp_hash` varbinary(32) NOT NULL,
	`attempts` smallint NOT NULL DEFAULT 0,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`ip_address` varchar(45),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `otp_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_history` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `password_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`actor_user_id` char(36),
	`actor_role` varchar(30),
	`action` varchar(100) NOT NULL,
	`target_type` varchar(50),
	`target_id` char(36),
	`details` json,
	`ip_address` varchar(45),
	`user_agent` varchar(255),
	`request_id` char(36),
	`prev_hash` varbinary(32),
	`row_hash` varbinary(32) NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` char(36) NOT NULL,
	`bucket` varchar(60) NOT NULL,
	`object_key` varchar(512) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`size_bytes` bigint NOT NULL,
	`checksum_sha256` varbinary(32),
	`purpose` varchar(20) NOT NULL,
	`scan_status` varchar(12) NOT NULL DEFAULT 'pending',
	`uploaded_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `files_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_files_object` UNIQUE(`bucket`,`object_key`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` char(36) NOT NULL,
	`code` varchar(80) NOT NULL,
	`module` varchar(40) NOT NULL,
	`description` text,
	`super_admin_only` boolean NOT NULL DEFAULT false,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` char(36) NOT NULL,
	`permission_id` char(36) NOT NULL,
	CONSTRAINT `role_permissions_role_id_permission_id_pk` PRIMARY KEY(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` char(36) NOT NULL,
	`code` varchar(30) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `user_permission_overrides` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`permission_id` char(36) NOT NULL,
	`effect` enum('grant','deny') NOT NULL,
	`reason` text NOT NULL,
	`granted_by` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3),
	CONSTRAINT `user_permission_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_override_user_permission` UNIQUE(`user_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` char(36) NOT NULL,
	`contractor_number` varchar(20) NOT NULL,
	`full_name` varchar(255) NOT NULL,
	`business_email_ct` varbinary(512) NOT NULL,
	`personal_email_ct` varbinary(512) NOT NULL,
	`personal_email_bidx` varbinary(32) NOT NULL,
	`phone_ct` varbinary(512),
	`id_number_ct` varbinary(512),
	`location` varchar(255),
	`profile_picture_file_id` char(36),
	`enc_key_id` smallint NOT NULL,
	`cap_phase_hint` varchar(30),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_profiles_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `uq_profiles_contractor` UNIQUE(`contractor_number`),
	CONSTRAINT `uq_profiles_personal_email` UNIQUE(`personal_email_bidx`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`role_id` char(36) NOT NULL,
	`business_email_ct` varbinary(512) NOT NULL,
	`business_email_bidx` varbinary(32) NOT NULL,
	`password_hash` text,
	`password_changed_at` datetime(3),
	`status` enum('active','frozen','on_leave','deactivated','deleted') NOT NULL DEFAULT 'active',
	`status_reason` text,
	`status_changed_at` datetime(3),
	`status_changed_by` char(36),
	`freeze_started_at` datetime(3),
	`failed_login_count` int NOT NULL DEFAULT 0,
	`locked_until` datetime(3),
	`last_login_at` datetime(3),
	`last_login_ip` varchar(45),
	`login_count` int NOT NULL DEFAULT 0,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_business_email` UNIQUE(`business_email_bidx`)
);
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `login_attempts` ADD CONSTRAINT `login_attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `one_time_links` ADD CONSTRAINT `one_time_links_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `otp_challenges` ADD CONSTRAINT `otp_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_history` ADD CONSTRAINT `password_history_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `files` ADD CONSTRAINT `files_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD CONSTRAINT `user_permission_overrides_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD CONSTRAINT `user_permission_overrides_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD CONSTRAINT `user_permission_overrides_granted_by_users_id_fk` FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_profile_picture_file_id_files_id_fk` FOREIGN KEY (`profile_picture_file_id`) REFERENCES `files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_status_changed_by_users_id_fk` FOREIGN KEY (`status_changed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_sessions_previous` ON `auth_sessions` (`previous_token_hash`);--> statement-breakpoint
CREATE INDEX `ix_sessions_user` ON `auth_sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `ix_login_attempts_user` ON `login_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_password_history_user` ON `password_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_users_status` ON `users` (`status`);