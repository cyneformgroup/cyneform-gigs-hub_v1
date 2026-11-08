ALTER TABLE `user_profiles` MODIFY COLUMN `business_email_ct` varbinary(512);--> statement-breakpoint
ALTER TABLE `user_profiles` MODIFY COLUMN `personal_email_ct` varbinary(512);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `business_email_ct` varbinary(512);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `personal_email` varchar(254);--> statement-breakpoint
ALTER TABLE `users` ADD `business_email` varchar(254);