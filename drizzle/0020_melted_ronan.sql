ALTER TABLE `seo_projects` ADD `targetDays` int DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `aiEstimatedDays` int;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `aiPlan` json;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `aiPlanCreatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `aiAgentStatus` enum('idle','planning','executing','waiting','completed','failed') DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `aiAgentLastAction` text;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `aiAgentNextAction` text;--> statement-breakpoint
ALTER TABLE `seo_projects` ADD `aiAgentError` text;