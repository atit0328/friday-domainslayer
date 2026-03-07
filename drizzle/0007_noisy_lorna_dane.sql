ALTER TABLE `deploy_history` ADD `aiAnalysis` json;--> statement-breakpoint
ALTER TABLE `deploy_history` ADD `preScreenScore` int;--> statement-breakpoint
ALTER TABLE `deploy_history` ADD `preScreenRisk` varchar(16);--> statement-breakpoint
ALTER TABLE `deploy_history` ADD `serverType` varchar(64);--> statement-breakpoint
ALTER TABLE `deploy_history` ADD `wafDetected` varchar(64);--> statement-breakpoint
ALTER TABLE `deploy_history` ADD `altMethodUsed` varchar(64);--> statement-breakpoint
ALTER TABLE `deploy_history` ADD `stealthBrowserUsed` boolean DEFAULT false NOT NULL;