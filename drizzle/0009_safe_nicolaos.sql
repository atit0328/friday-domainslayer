ALTER TABLE `seo_projects` ADD `wpUsername` varchar(255);--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `wpAppPassword` text;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `wpConnected` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `wpSeoPlugin` varchar(32);--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignPhase` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignTotalPhases` int DEFAULT 16 NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignRunStatus` enum('idle','running','paused','completed','failed') DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignProgress` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignLastPhaseResult` json;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `campaignCompletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `totalWpChanges` int DEFAULT 0;