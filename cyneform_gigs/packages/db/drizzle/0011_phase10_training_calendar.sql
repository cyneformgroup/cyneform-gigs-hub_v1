CREATE TABLE `training_files` (
	`id` char(36) NOT NULL,
	`title` varchar(150) NOT NULL,
	`description` varchar(1000),
	`folder` varchar(60) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`stored_name` varchar(80) NOT NULL,
	`file_type` varchar(8) NOT NULL,
	`size_bytes` int NOT NULL,
	`watermark` varchar(200) NOT NULL,
	`uploaded_by` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `training_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_views` (
	`id` char(36) NOT NULL,
	`file_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`viewed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ip` varchar(64),
	`user_agent` varchar(255),
	`downloaded` int NOT NULL DEFAULT 0,
	CONSTRAINT `training_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meeting_attendees` (
	`id` char(36) NOT NULL,
	`meeting_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`status` varchar(10) NOT NULL DEFAULT 'pending',
	`attendance_awarded` boolean NOT NULL DEFAULT false,
	`marked_by` char(36),
	`marked_at` datetime(3),
	CONSTRAINT `meeting_attendees_id` PRIMARY KEY(`id`),
	CONSTRAINT `meeting_attendee_uq` UNIQUE(`meeting_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` char(36) NOT NULL,
	`series_id` char(36),
	`title` varchar(150) NOT NULL,
	`description` varchar(1000),
	`starts_at` datetime(3) NOT NULL,
	`duration_min` int NOT NULL,
	`agenda` varchar(2000),
	`link` varchar(500) NOT NULL,
	`reminder_minutes` int NOT NULL DEFAULT 60,
	`recurrence` varchar(10) NOT NULL DEFAULT 'none',
	`created_by` char(36) NOT NULL,
	`cancelled_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `meetings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `training_folder_idx` ON `training_files` (`folder`);--> statement-breakpoint
CREATE INDEX `training_view_user_idx` ON `training_views` (`user_id`,`file_id`);--> statement-breakpoint
CREATE INDEX `meeting_attendee_user_idx` ON `meeting_attendees` (`user_id`);--> statement-breakpoint
CREATE INDEX `meeting_start_idx` ON `meetings` (`starts_at`);