ALTER TABLE `scheduled_scans` ADD `autoRemediationEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_scans` ADD `autoRemediationCategories` json;--> statement-breakpoint
ALTER TABLE `scheduled_scans` ADD `autoRemediationDryRun` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_scans` ADD `lastRemediationAt` timestamp;--> statement-breakpoint
ALTER TABLE `scheduled_scans` ADD `totalRemediations` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_scans` ADD `totalFixesApplied` int DEFAULT 0 NOT NULL;