ALTER TABLE `seo_projects` ADD `autoRunEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `autoRunDay` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `autoRunHour` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `lastAutoRunAt` timestamp;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `nextAutoRunAt` timestamp;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `autoRunCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `lastAutoRunResult` json;