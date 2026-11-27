CREATE TABLE `weekly_reports` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`week_start` varchar(10) NOT NULL,
	`challenges` text NOT NULL,
	`recommendations` text NOT NULL,
	`feedback` text NOT NULL,
	`setbacks` text NOT NULL,
	`next_week_calls` text NOT NULL,
	`snapshot` text NOT NULL,
	`on_time` int NOT NULL DEFAULT 0,
	`submitted_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `weekly_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_report_uq` UNIQUE(`user_id`,`week_start`)
);
